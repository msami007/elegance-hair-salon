const Barber = require('../models/Barber');
const Appointment = require('../models/Appointment');

// GET /api/reports/barber-performance?salonId=
exports.getBarberPerformance = async (req, res) => {
  try {
    const { salonId } = req.query;
    if (!salonId) {
      return res.status(400).json({ error: 'salonId parameter is required' });
    }

    // 1. Fetch all barbers for this salon (including inactive, to show historical stats)
    const barbers = await Barber.find({ salonId }).lean();

    // 2. Fetch all appointments for this salon
    const appointments = await Appointment.find({ salonId }).lean();

    // 3. Initialize mapping for barber metrics
    const barberStats = {};
    barbers.forEach(b => {
      barberStats[b._id.toString()] = {
        barber: {
          _id: b._id,
          name: b.name,
          title: b.title,
          photo: b.photo,
          role: b.role,
          isActive: b.isActive
        },
        totalRevenue: 0,
        totalBookings: 0,
        completedBookings: 0,
        noShowCount: 0,
        cancelledCount: 0,
        uniqueClientsMap: new Map(), // clientId -> count of appointments
      };
    });

    // 4. Aggregate data from appointments
    appointments.forEach(appt => {
      const bId = appt.barberId?.toString();
      if (!bId || !barberStats[bId]) return;

      const stats = barberStats[bId];
      stats.totalBookings++;

      if (appt.status === 'cancelled') {
        stats.cancelledCount++;
      } else if (appt.status === 'no-show') {
        stats.noShowCount++;
      } else if (appt.status === 'completed' || appt.status === 'confirmed') {
        stats.completedBookings++;
        stats.totalRevenue += (appt.totalPrice || 0) / 100;

        const cId = appt.clientId?.toString();
        if (cId) {
          stats.uniqueClientsMap.set(cId, (stats.uniqueClientsMap.get(cId) || 0) + 1);
        }
      }
    });

    // 5. Finalize individual calculations
    const performanceList = Object.values(barberStats).map(stats => {
      const uniqueClientsCount = stats.uniqueClientsMap.size;
      let repeatClientsCount = 0;

      stats.uniqueClientsMap.forEach((count) => {
        if (count >= 2) repeatClientsCount++;
      });

      // Avoid division by zero bugs
      const returnRate = uniqueClientsCount > 0
        ? Math.round((repeatClientsCount / uniqueClientsCount) * 100)
        : 0;

      const noShowRate = stats.totalBookings > 0
        ? Math.round((stats.noShowCount / stats.totalBookings) * 100)
        : 0;

      const cancellationRate = stats.totalBookings > 0
        ? Math.round((stats.cancelledCount / stats.totalBookings) * 100)
        : 0;

      // Clean up Map before serialization
      delete stats.uniqueClientsMap;

      return {
        ...stats,
        uniqueClientsCount,
        repeatClientsCount,
        returnRate,
        noShowRate,
        cancellationRate,
        totalRevenue: Math.round(stats.totalRevenue * 100) / 100 // format money nicely
      };
    });

    // 6. Aggregate shop-wide stats
    const salonClientsMap = new Map();
    let totalSalonRevenue = 0;
    let totalSalonBookings = 0;
    let totalSalonNoShows = 0;
    let totalSalonCancelled = 0;

    appointments.forEach(appt => {
      if (appt.status === 'completed' || appt.status === 'confirmed') {
        totalSalonBookings++;
        totalSalonRevenue += (appt.totalPrice || 0) / 100;
        const cId = appt.clientId?.toString();
        if (cId) {
          salonClientsMap.set(cId, (salonClientsMap.get(cId) || 0) + 1);
        }
      } else if (appt.status === 'no-show') {
        totalSalonNoShows++;
      } else if (appt.status === 'cancelled') {
        totalSalonCancelled++;
      }
    });

    let totalSalonRepeatClients = 0;
    salonClientsMap.forEach((count) => {
      if (count >= 2) totalSalonRepeatClients++;
    });

    const salonUniqueClients = salonClientsMap.size;
    const salonReturnRate = salonUniqueClients > 0
      ? Math.round((totalSalonRepeatClients / salonUniqueClients) * 100)
      : 0;

    res.json({
      summary: {
        totalRevenue: Math.round(totalSalonRevenue * 100) / 100,
        totalBookings: totalSalonBookings,
        uniqueClientsCount: salonUniqueClients,
        repeatClientsCount: totalSalonRepeatClients,
        returnRate: salonReturnRate,
        totalNoShows: totalSalonNoShows,
        totalCancelled: totalSalonCancelled
      },
      barberPerformance: performanceList
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
