const Barber = require('../models/Barber');
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const Location = require('../models/Location');

// GET /api/reports/barber-performance?salonId=
exports.getBarberPerformance = async (req, res) => {
  try {
    const { salonId } = req.query;
    if (!salonId) {
      return res.status(400).json({ error: 'salonId parameter is required' });
    }

    // 1. Fetch all barbers for this salon (including inactive, to show historical stats)
    const barbers = await Barber.find({ salonId }).lean();

    // 2. Fetch all appointments for this salon, populating locationId and serviceId details
    const appointments = await Appointment.find({ salonId })
      .populate('locationId')
      .populate('serviceId')
      .lean();

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

    // 7. Calculate Revenue Trends (grouped by date)
    const trendMap = {};
    appointments.forEach(appt => {
      if (appt.status === 'completed' || appt.status === 'confirmed') {
        const dateStr = appt.date;
        if (!trendMap[dateStr]) {
          trendMap[dateStr] = { date: dateStr, revenue: 0, bookings: 0 };
        }
        trendMap[dateStr].revenue += (appt.totalPrice || 0) / 100;
        trendMap[dateStr].bookings++;
      }
    });
    const revenueTrends = Object.values(trendMap)
      .map(t => ({
        ...t,
        revenue: Math.round(t.revenue * 100) / 100
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 8. Calculate Service Popularity
    const serviceStats = {};
    const servicesList = await Service.find({ salonId }).lean();
    servicesList.forEach(s => {
      serviceStats[s._id.toString()] = {
        id: s._id,
        name: s.name,
        category: s.category,
        bookingsCount: 0,
        revenue: 0,
        price: s.price / 100
      };
    });

    appointments.forEach(appt => {
      const sId = appt.serviceId?._id?.toString() || appt.serviceId?.toString();
      if (!sId) return;

      if (!serviceStats[sId]) {
        serviceStats[sId] = {
          id: sId,
          name: appt.serviceId?.name || 'Service',
          category: appt.serviceId?.category || 'General',
          bookingsCount: 0,
          revenue: 0,
          price: (appt.serviceId?.price || 0) / 100
        };
      }

      if (appt.status === 'completed' || appt.status === 'confirmed') {
        const stats = serviceStats[sId];
        stats.bookingsCount++;
        stats.revenue += (appt.totalPrice || 0) / 100;
      }
    });

    const servicePopularity = Object.values(serviceStats)
      .map(s => ({
        ...s,
        revenue: Math.round(s.revenue * 100) / 100
      }))
      .sort((a, b) => b.bookingsCount - a.bookingsCount || b.revenue - a.revenue);

    // 9. Calculate Location Comparison
    const locationStats = {};
    const locationsList = await Location.find({ salonId }).lean();
    locationsList.forEach(loc => {
      locationStats[loc._id.toString()] = {
        location: {
          _id: loc._id,
          name: loc.name,
          city: loc.city,
          state: loc.state
        },
        totalRevenue: 0,
        totalBookings: 0,
        completedBookings: 0,
        noShowCount: 0,
        cancelledCount: 0,
        uniqueClientsMap: new Map()
      };
    });

    appointments.forEach(appt => {
      const locId = appt.locationId?._id?.toString() || appt.locationId?.toString();
      if (!locId) return;

      if (!locationStats[locId]) {
        locationStats[locId] = {
          location: {
            _id: locId,
            name: appt.locationId?.name || 'Location',
            city: appt.locationId?.city || 'City',
            state: appt.locationId?.state || ''
          },
          totalRevenue: 0,
          totalBookings: 0,
          completedBookings: 0,
          noShowCount: 0,
          cancelledCount: 0,
          uniqueClientsMap: new Map()
        };
      }

      const stats = locationStats[locId];
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

    const locationComparison = Object.values(locationStats).map(stats => {
      const uniqueClientsCount = stats.uniqueClientsMap.size;
      let repeatClientsCount = 0;
      stats.uniqueClientsMap.forEach((count) => {
        if (count >= 2) repeatClientsCount++;
      });

      const returnRate = uniqueClientsCount > 0
        ? Math.round((repeatClientsCount / uniqueClientsCount) * 100)
        : 0;

      const noShowRate = stats.totalBookings > 0
        ? Math.round((stats.noShowCount / stats.totalBookings) * 100)
        : 0;

      const cancellationRate = stats.totalBookings > 0
        ? Math.round((stats.cancelledCount / stats.totalBookings) * 100)
        : 0;

      delete stats.uniqueClientsMap;

      return {
        ...stats,
        uniqueClientsCount,
        repeatClientsCount,
        returnRate,
        noShowRate,
        cancellationRate,
        totalRevenue: Math.round(stats.totalRevenue * 100) / 100
      };
    });

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
      barberPerformance: performanceList,
      revenueTrends,
      servicePopularity,
      locationComparison
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
