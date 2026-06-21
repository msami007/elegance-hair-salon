const Cadence = require('../models/Cadence');
const CadenceEnrollment = require('../models/CadenceEnrollment');
const Appointment = require('../models/Appointment');
const Client = require('../models/Client');
const Barber = require('../models/Barber');
const Service = require('../models/Service');
const Location = require('../models/Location');
const { sendSMS } = require('./twilio');
const dayjs = require('dayjs');

/**
 * Enroll an appointment into the active pre-appointment cadence (auto mode).
 */
async function enrollAppointment(appointmentId) {
  try {
    const appointment = await Appointment.findById(appointmentId)
      .populate('clientId')
      .populate('barberId')
      .populate('serviceId')
      .populate('locationId')
      .lean();

    if (!appointment) {
      console.log(`[Cadence] Appointment ${appointmentId} not found, skipping enrollment`);
      return null;
    }

    const cadence = await Cadence.findOne({
      salonId: appointment.salonId,
      type: 'pre-appointment',
      isActive: true,
    }).lean();

    if (!cadence) {
      console.log('[Cadence] No active pre-appointment cadence found, skipping enrollment');
      return null;
    }

    const existing = await CadenceEnrollment.findOne({
      cadenceId: cadence._id,
      appointmentId: appointment._id,
    });

    if (existing) {
      console.log(`[Cadence] Appointment ${appointmentId} already enrolled in cadence ${cadence.name}`);
      return existing;
    }

    const appointmentDatetime = dayjs(`${appointment.date} ${appointment.startTime}`, 'YYYY-MM-DD HH:mm');

    const stepExecutions = cadence.steps
      .sort((a, b) => a.order - b.order)
      .map(step => {
        const unit = step.delayUnit === 'days' ? 'day' : step.delayUnit === 'hours' ? 'hour' : 'minute';
        let scheduledAt;
        if (step.delayDirection === 'before') {
          scheduledAt = appointmentDatetime.subtract(step.delayValue, unit);
        } else {
          scheduledAt = appointmentDatetime.add(step.delayValue, unit);
        }
        const isPast = scheduledAt.isBefore(dayjs());
        return {
          stepOrder: step.order,
          scheduledAt: scheduledAt.toDate(),
          executedAt: isPast ? new Date() : null,
          status: isPast ? 'skipped' : 'pending',
          messageSid: '',
          error: isPast ? 'Skipped: scheduled time already passed at enrollment' : '',
        };
      });

    const enrollment = await CadenceEnrollment.create({
      cadenceId: cadence._id,
      appointmentId: appointment._id,
      clientId: appointment.clientId._id || appointment.clientId,
      salonId: appointment.salonId,
      source: 'auto',
      status: 'active',
      stepExecutions,
    });

    const pendingCount = stepExecutions.filter(s => s.status === 'pending').length;
    console.log(`[Cadence] Enrolled appointment ${appointmentId} in "${cadence.name}" — ${pendingCount} pending steps`);
    return enrollment;
  } catch (error) {
    console.error('[Cadence] Enrollment error:', error.message);
    return null;
  }
}

/**
 * Manually enroll a list of clients into a cadence.
 * Steps are scheduled relative to enrollment time (now).
 */
async function enrollClients(cadenceId, clientIds, salonId) {
  const cadence = await Cadence.findById(cadenceId).lean();
  if (!cadence) throw new Error('Cadence not found');

  const now = dayjs();
  const enrolled = [];

  for (const clientId of clientIds) {
    const existing = await CadenceEnrollment.findOne({
      cadenceId: cadence._id,
      clientId,
      status: { $in: ['active', 'paused'] },
    });
    if (existing) continue;

    const stepExecutions = cadence.steps
      .sort((a, b) => a.order - b.order)
      .map(step => {
        const unit = step.delayUnit === 'days' ? 'day' : step.delayUnit === 'hours' ? 'hour' : 'minute';
        const scheduledAt = now.add(step.delayValue, unit);
        return {
          stepOrder: step.order,
          scheduledAt: scheduledAt.toDate(),
          executedAt: null,
          status: 'pending',
          messageSid: '',
          error: '',
        };
      });

    const enrollment = await CadenceEnrollment.create({
      cadenceId: cadence._id,
      clientId,
      salonId,
      source: 'manual',
      status: 'active',
      stepExecutions,
    });
    enrolled.push(enrollment);
  }

  console.log(`[Cadence] Manually enrolled ${enrolled.length}/${clientIds.length} clients in "${cadence.name}"`);
  return enrolled;
}

/**
 * Resolve template variables in a message template.
 */
function resolveTemplate(template, vars) {
  return (template || '')
    .replace(/\{\{firstName\}\}/g, vars.firstName || '')
    .replace(/\{\{lastName\}\}/g, vars.lastName || '')
    .replace(/\{\{serviceName\}\}/g, vars.serviceName || '')
    .replace(/\{\{barberName\}\}/g, vars.barberName || '')
    .replace(/\{\{date\}\}/g, vars.date || '')
    .replace(/\{\{time\}\}/g, vars.time || '')
    .replace(/\{\{locationName\}\}/g, vars.locationName || '')
    .replace(/\{\{locationAddress\}\}/g, vars.locationAddress || '');
}

/**
 * Process all pending cadence steps that are due for execution.
 */
async function processPendingSteps() {
  try {
    const now = new Date();

    const enrollments = await CadenceEnrollment.find({
      status: 'active',
      stepExecutions: {
        $elemMatch: {
          status: 'pending',
          scheduledAt: { $lte: now },
        },
      },
    }).lean();

    if (enrollments.length === 0) return;

    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    for (const enrollment of enrollments) {
      let appointment = null;
      let client = null;
      let templateVars;

      if (enrollment.appointmentId) {
        appointment = await Appointment.findById(enrollment.appointmentId)
          .populate('clientId')
          .populate('barberId')
          .populate('serviceId')
          .populate('locationId')
          .lean();

        if (!appointment || appointment.status === 'cancelled') {
          await CadenceEnrollment.updateOne(
            { _id: enrollment._id },
            {
              $set: {
                status: 'cancelled',
                'stepExecutions.$[elem].status': 'skipped',
                'stepExecutions.$[elem].executedAt': now,
                'stepExecutions.$[elem].error': 'Appointment was cancelled',
              },
            },
            { arrayFilters: [{ 'elem.status': 'pending' }] }
          );
          totalSkipped++;
          continue;
        }

        client = appointment.clientId || {};
        templateVars = {
          firstName: client.firstName || 'there',
          lastName: client.lastName || '',
          serviceName: appointment.serviceId?.name || 'your appointment',
          barberName: appointment.barberId?.name || 'your stylist',
          date: dayjs(appointment.date).format('ddd, MMM D'),
          time: dayjs(`${appointment.date} ${appointment.startTime}`, 'YYYY-MM-DD HH:mm').format('h:mm A'),
          locationName: appointment.locationId?.name || 'Elegance Salon',
          locationAddress: appointment.locationId?.address || '',
        };
      } else {
        client = await Client.findById(enrollment.clientId).lean();
        if (!client) continue;
        templateVars = {
          firstName: client.firstName || 'there',
          lastName: client.lastName || '',
          serviceName: 'your appointment',
          barberName: 'your stylist',
          date: '',
          time: '',
          locationName: 'Elegance Salon',
          locationAddress: '',
        };
      }

      const cadence = await Cadence.findById(enrollment.cadenceId).lean();
      if (!cadence) continue;

      for (const stepExec of enrollment.stepExecutions) {
        if (stepExec.status !== 'pending') continue;
        if (new Date(stepExec.scheduledAt) > now) continue;

        const stepDef = cadence.steps.find(s => s.order === stepExec.stepOrder);
        if (!stepDef) continue;

        if (stepDef.channel === 'voice') {
          const voiceService = require('./voiceService');
          const callResult = await voiceService.triggerOutboundCall({
            clientId: client._id || enrollment.clientId,
            type: stepDef.voiceCallType || 're-engagement',
            salonId: enrollment.salonId,
            appointmentId: enrollment.appointmentId || undefined,
          });

          if (callResult.success) {
            await CadenceEnrollment.updateOne(
              { _id: enrollment._id, 'stepExecutions.stepOrder': stepExec.stepOrder },
              {
                $set: {
                  'stepExecutions.$.status': 'sent',
                  'stepExecutions.$.executedAt': new Date(),
                  'stepExecutions.$.messageSid': callResult.callLogId || '',
                },
              }
            );
            totalSent++;
          } else {
            await CadenceEnrollment.updateOne(
              { _id: enrollment._id, 'stepExecutions.stepOrder': stepExec.stepOrder },
              {
                $set: {
                  'stepExecutions.$.status': 'failed',
                  'stepExecutions.$.executedAt': new Date(),
                  'stepExecutions.$.error': callResult.error || 'Voice call failed',
                },
              }
            );
            totalFailed++;
          }
        } else {
          const messageBody = resolveTemplate(stepDef.messageTemplate, templateVars);
          const smsResult = await sendSMS({
            to: client.phone,
            body: messageBody,
          });

          if (smsResult.success) {
            await CadenceEnrollment.updateOne(
              { _id: enrollment._id, 'stepExecutions.stepOrder': stepExec.stepOrder },
              {
                $set: {
                  'stepExecutions.$.status': 'sent',
                  'stepExecutions.$.executedAt': new Date(),
                  'stepExecutions.$.messageSid': smsResult.messageSid || '',
                },
              }
            );
            totalSent++;
          } else {
            await CadenceEnrollment.updateOne(
              { _id: enrollment._id, 'stepExecutions.stepOrder': stepExec.stepOrder },
              {
                $set: {
                  'stepExecutions.$.status': 'failed',
                  'stepExecutions.$.executedAt': new Date(),
                  'stepExecutions.$.error': smsResult.error || 'Unknown SMS error',
                },
              }
            );
            totalFailed++;
          }
        }
      }

      const updatedEnrollment = await CadenceEnrollment.findById(enrollment._id).lean();
      const allDone = updatedEnrollment.stepExecutions.every(s => s.status !== 'pending');
      if (allDone) {
        await CadenceEnrollment.updateOne(
          { _id: enrollment._id },
          { $set: { status: 'completed' } }
        );
      }
    }

    if (totalSent > 0 || totalFailed > 0 || totalSkipped > 0) {
      console.log(`[Cadence Tick] Processed: ${totalSent} sent, ${totalFailed} failed, ${totalSkipped} skipped`);
    }
  } catch (error) {
    console.error('[Cadence Tick Error]', error.message);
  }
}

/**
 * Cancel all pending cadence steps for a given appointment.
 */
async function cancelEnrollment(appointmentId) {
  try {
    const now = new Date();
    const result = await CadenceEnrollment.updateMany(
      { appointmentId, status: 'active' },
      {
        $set: {
          status: 'cancelled',
          'stepExecutions.$[elem].status': 'skipped',
          'stepExecutions.$[elem].executedAt': now,
          'stepExecutions.$[elem].error': 'Appointment cancelled by user',
        },
      },
      { arrayFilters: [{ 'elem.status': 'pending' }] }
    );
    if (result.modifiedCount > 0) {
      console.log(`[Cadence] Cancelled ${result.modifiedCount} enrollment(s) for appointment ${appointmentId}`);
    }
  } catch (error) {
    console.error('[Cadence] Cancel enrollment error:', error.message);
  }
}

module.exports = {
  enrollAppointment,
  enrollClients,
  processPendingSteps,
  cancelEnrollment,
};
