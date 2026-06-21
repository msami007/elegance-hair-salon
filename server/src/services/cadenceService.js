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
 * Enroll an appointment into the active pre-appointment cadence.
 * Calculates concrete scheduledAt timestamps for each step.
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

    // Find active pre-appointment cadence for this salon
    const cadence = await Cadence.findOne({
      salonId: appointment.salonId,
      type: 'pre-appointment',
      isActive: true,
    }).lean();

    if (!cadence) {
      console.log('[Cadence] No active pre-appointment cadence found, skipping enrollment');
      return null;
    }

    // Check if already enrolled
    const existing = await CadenceEnrollment.findOne({
      cadenceId: cadence._id,
      appointmentId: appointment._id,
    });

    if (existing) {
      console.log(`[Cadence] Appointment ${appointmentId} already enrolled in cadence ${cadence.name}`);
      return existing;
    }

    // Calculate the appointment datetime
    const appointmentDatetime = dayjs(`${appointment.date} ${appointment.startTime}`, 'YYYY-MM-DD HH:mm');

    // Build step executions with concrete scheduled timestamps
    const stepExecutions = cadence.steps
      .sort((a, b) => a.order - b.order)
      .map(step => {
        let scheduledAt;

        if (step.delayDirection === 'before') {
          scheduledAt = appointmentDatetime.subtract(step.delayValue, step.delayUnit === 'hours' ? 'hour' : 'minute');
        } else {
          scheduledAt = appointmentDatetime.add(step.delayValue, step.delayUnit === 'hours' ? 'hour' : 'minute');
        }

        // If the scheduled time is already in the past, mark it for immediate skipping
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
 * Resolve template variables in a message template.
 */
function resolveTemplate(template, vars) {
  return template
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
 * This is the "tick" function called by the scheduler.
 */
async function processPendingSteps() {
  try {
    const now = new Date();

    // Find active enrollments with at least one pending step that is due
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
      // Check if the appointment is still valid (not cancelled)
      const appointment = await Appointment.findById(enrollment.appointmentId)
        .populate('clientId')
        .populate('barberId')
        .populate('serviceId')
        .populate('locationId')
        .lean();

      if (!appointment || appointment.status === 'cancelled') {
        // Cancel all pending steps
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

      // Load the cadence to get message templates
      const cadence = await Cadence.findById(enrollment.cadenceId).lean();
      if (!cadence) continue;

      // Prepare template variables
      const client = appointment.clientId || {};
      const templateVars = {
        firstName: client.firstName || 'there',
        lastName: client.lastName || '',
        serviceName: appointment.serviceId?.name || 'your appointment',
        barberName: appointment.barberId?.name || 'your stylist',
        date: dayjs(appointment.date).format('ddd, MMM D'),
        time: dayjs(`${appointment.date} ${appointment.startTime}`, 'YYYY-MM-DD HH:mm').format('h:mm A'),
        locationName: appointment.locationId?.name || 'Elegance Salon',
        locationAddress: appointment.locationId?.address || '',
      };

      // Process each due step
      for (const stepExec of enrollment.stepExecutions) {
        if (stepExec.status !== 'pending') continue;
        if (new Date(stepExec.scheduledAt) > now) continue;

        // Find the corresponding cadence step definition
        const stepDef = cadence.steps.find(s => s.order === stepExec.stepOrder);
        if (!stepDef) continue;

        // Resolve template
        const messageBody = resolveTemplate(stepDef.messageTemplate, templateVars);

        // Send SMS
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

      // Check if all steps are done — mark enrollment as completed
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
  processPendingSteps,
  cancelEnrollment,
};
