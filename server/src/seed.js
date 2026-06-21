/**
 * Seed script for Elegance Hair Salon POC
 * Uses real service data from Booksy audit and placeholder staff profiles
 * Run: node src/seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Salon = require('./models/Salon');
const Location = require('./models/Location');
const Barber = require('./models/Barber');
const Service = require('./models/Service');
const Client = require('./models/Client');
const Appointment = require('./models/Appointment');
const Cadence = require('./models/Cadence');
const CadenceEnrollment = require('./models/CadenceEnrollment');
const dayjs = require('dayjs');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  await Promise.all([
    Salon.deleteMany({}), Location.deleteMany({}), Barber.deleteMany({}),
    Service.deleteMany({}), Client.deleteMany({}), Appointment.deleteMany({}),
    Cadence.deleteMany({}), CadenceEnrollment.deleteMany({}),
  ]);
  console.log('Cleared existing data');

  // ── Salon ──
  const salon = await Salon.create({
    name: 'Elegance Hair Salon & Barbershop',
    slug: 'elegance-hair-salon',
    branding: { primaryColor: '#000000', accentColor: '#C8A96E', logo: '' },
    contactEmail: '1704elegance@gmail.com',
    website: 'http://www.elegancehairsalonandbarbershop.com',
    instagramHandle: '@elegancehairsalons',
  });

  // ── Locations ──
  const chicago = await Location.create({
    salonId: salon._id,
    name: 'Chicago',
    address: '301 W Washington St',
    city: 'Chicago',
    state: 'IL',
    zip: '60606',
    phone: '+13128828218',
    email: '1704elegance@gmail.com',
  });

  const evanston = await Location.create({
    salonId: salon._id,
    name: 'Evanston',
    address: '1704 Sherman Ave',
    city: 'Evanston',
    state: 'IL',
    zip: '60201',
    phone: '+18478596123',
    email: '1704elegance@gmail.com',
  });

  // ── Barbers (from Booksy audit — Evanston location) ──
  const lucky = await Barber.create({
    salonId: salon._id, locationId: evanston._id,
    name: 'Lucky', title: 'Master Barber', role: 'owner',
    phone: '+17084005589', email: '1704elegance@gmail.com',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
    bio: 'Owner and master barber with over 15 years of experience. Specializes in classic cuts, fades, and beard grooming.',
    specialisms: ['classic', 'fade', 'skin-fade', 'beard', 'textured', 'buzz'],
  });

  const oskar = await Barber.create({
    salonId: salon._id, locationId: evanston._id,
    name: 'Oskar', title: 'Master Hairdresser', role: 'staffer',
    phone: '+17087173210', email: 'askarsaleh1973@icloud.com',
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
    bio: 'Master hairdresser with expertise in color, styling, and women\'s cuts. Known for precision and artistry.',
    specialisms: ['color', 'highlights', 'balayage', 'styling', 'blowout', 'curly', 'extensions'],
  });

  const shamiram = await Barber.create({
    salonId: salon._id, locationId: evanston._id,
    name: 'Shamiram', title: 'Master Hairstylist', role: 'basic_staffer',
    phone: '+18478771078', email: 'shamiram1991@yahoo.com',
    photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=80',
    bio: 'Master hairstylist specializing in color techniques, smoothing treatments, and formal styling.',
    specialisms: ['color', 'keratin', 'smoothing', 'perm', 'styling', 'updo', 'highlights', 'balayage'],
  });

  const ahmad = await Barber.create({
    salonId: salon._id, locationId: evanston._id,
    name: 'Ahmad', title: 'Skin Fade Specialist', role: 'basic_staffer',
    phone: '+12243823301', email: 'oskarahmad33@gmail.com',
    photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80',
    bio: 'Skin fade specialist with sharp precision in fades, lineups, and modern men\'s styles.',
    specialisms: ['skin-fade', 'fade', 'beard', 'textured', 'lineup', 'buzz'],
  });

  // ── Chicago Barbers ──
  const marcus = await Barber.create({
    salonId: salon._id, locationId: chicago._id,
    name: 'Marcus', title: 'Senior Barber', role: 'staffer',
    phone: '+13125552001', email: 'marcus.chicago@elegance.com',
    photo: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=300&auto=format&fit=crop&q=80',
    bio: 'Senior Chicago barber specializing in modern skin fades, custom beard line-ups, and classic hot towel shaves.',
    specialisms: ['skin-fade', 'fade', 'beard', 'classic', 'buzz', 'lineup'],
  });

  const elena = await Barber.create({
    salonId: salon._id, locationId: chicago._id,
    name: 'Elena', title: 'Lead Hairstylist', role: 'staffer',
    phone: '+13125552002', email: 'elena.chicago@elegance.com',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&auto=format&fit=crop&q=80',
    bio: 'Lead Chicago stylist with expertise in color, highlights, balayage, keratin treatments, and custom styles.',
    specialisms: ['color', 'highlights', 'balayage', 'styling', 'blowout', 'keratin', 'smoothing'],
  });

  // ── Service Templates (to populate both locations) ──
  const serviceTemplates = [
    // Men's Services
    { category: 'mens-services', name: "Men's Barber Style Cut", evanstonPrice: 4500, chicagoPrice: 6500, duration: 30, styleTags: ['classic', 'fade', 'textured', 'skin-fade'], sortOrder: 1 },
    { category: 'mens-services', name: "Men's Barber Style Cut & Beard Line Up", description: 'Much more details into the haircuts', evanstonPrice: 7500, chicagoPrice: 9500, duration: 50, styleTags: ['fade', 'beard', 'classic'], sortOrder: 2 },
    { category: 'mens-services', name: 'Beard Trim - Straight Razor', evanstonPrice: 4000, chicagoPrice: 5000, duration: 25, styleTags: ['beard'], sortOrder: 3 },
    { category: 'mens-services', name: 'Buzz Cut', description: 'Clipper cut using one guard over the entire head', evanstonPrice: 3500, chicagoPrice: 4500, duration: 20, styleTags: ['buzz'], sortOrder: 4 },
    { category: 'mens-services', name: 'Kids Cut', evanstonPrice: 3500, priceVaries: true, chicagoPrice: 4000, duration: 25, styleTags: ['classic', 'fade'], sortOrder: 5 },
    { category: 'mens-services', name: 'Line Up', evanstonPrice: 1500, chicagoPrice: 2000, duration: 5, styleTags: ['lineup', 'fade'], sortOrder: 6 },
    { category: 'mens-services', name: "Men's Signature Style Package", evanstonPrice: 7500, chicagoPrice: 9500, duration: 45, styleTags: ['classic', 'fade', 'textured'], sortOrder: 7 },
    // Women's Services
    { category: 'womens-services', name: "Women's Haircut", evanstonPrice: 7500, priceVaries: true, chicagoPrice: 9500, duration: 60, styleTags: ['styling', 'classic'], sortOrder: 1 },
    { category: 'womens-services', name: "Woman's Haircut / No Blowdry", evanstonPrice: 5500, priceVaries: true, chicagoPrice: 7000, duration: 40, styleTags: ['classic'], sortOrder: 2 },
    { category: 'womens-services', name: 'Blow Dry', evanstonPrice: 5500, priceVaries: true, chicagoPrice: 6500, duration: 45, styleTags: ['blowout', 'styling'], sortOrder: 3 },
    { category: 'womens-services', name: 'Bang / Fringe Cut', evanstonPrice: 1800, chicagoPrice: 2500, duration: 15, styleTags: ['styling'], sortOrder: 4 },
    { category: 'womens-services', name: 'Updo Formal Styling', evanstonPrice: 12000, chicagoPrice: 15000, duration: 90, styleTags: ['updo', 'styling'], sortOrder: 5 },
    { category: 'womens-services', name: 'Extensions Blowout', evanstonPrice: 10000, priceVaries: true, chicagoPrice: 12000, duration: 60, styleTags: ['extensions', 'blowout'], sortOrder: 6 },
    { category: 'womens-services', name: "Women's Signature Style Package", evanstonPrice: 9500, chicagoPrice: 12000, duration: 90, styleTags: ['styling', 'classic'], sortOrder: 7 },
    // Color
    { category: 'color', name: 'Single Process Color', evanstonPrice: 9500, priceVaries: true, chicagoPrice: 11500, duration: 60, styleTags: ['color'], sortOrder: 1 },
    { category: 'color', name: 'Balayage', description: 'Hand painted highlights for a soft, natural blend', evanstonPrice: 28500, priceVaries: true, chicagoPrice: 32000, duration: 135, styleTags: ['balayage', 'highlights', 'color'], sortOrder: 2 },
    { category: 'color', name: 'Full Highlights', evanstonPrice: 24000, priceVaries: true, chicagoPrice: 27500, duration: 120, styleTags: ['highlights', 'color'], sortOrder: 3 },
    { category: 'color', name: 'Partial Highlights', evanstonPrice: 22000, priceVaries: true, chicagoPrice: 25000, duration: 105, styleTags: ['highlights', 'color'], sortOrder: 4 },
    { category: 'color', name: 'Root Touch-up w/ Gloss', evanstonPrice: 12000, priceVaries: true, chicagoPrice: 14500, duration: 60, styleTags: ['color'], sortOrder: 5 },
    { category: 'color', name: 'Gloss', evanstonPrice: 6000, chicagoPrice: 7500, duration: 45, styleTags: ['color'], sortOrder: 6 },
    // Men's Color
    { category: 'mens-color', name: 'Single Process Color (All Over)', evanstonPrice: 7500, priceVaries: true, chicagoPrice: 9000, duration: 45, styleTags: ['color'], sortOrder: 1 },
    { category: 'mens-color', name: 'Gray Blending', evanstonPrice: 6500, priceVaries: true, chicagoPrice: 8000, duration: 40, styleTags: ['color', 'gray-blending'], sortOrder: 2 },
    // Smoothing & Perms
    { category: 'smoothing-perms', name: 'Brazilian Smoothing Treatment', evanstonPrice: 25000, priceVaries: true, chicagoPrice: 29000, duration: 210, styleTags: ['smoothing', 'keratin'], sortOrder: 1 },
    { category: 'smoothing-perms', name: 'Keratin Smoothing Treatment', evanstonPrice: 27000, priceVaries: true, chicagoPrice: 31000, duration: 180, styleTags: ['keratin', 'smoothing'], sortOrder: 2 },
    { category: 'smoothing-perms', name: 'Perm', evanstonPrice: 20000, chicagoPrice: 23000, duration: 120, styleTags: ['perm', 'curly'], sortOrder: 3 },
    // Threading & Wax
    { category: 'threading-wax', name: 'Eyebrow Threading / Waxing', evanstonPrice: 1500, chicagoPrice: 1800, duration: 10, styleTags: ['threading'], sortOrder: 1 },
    { category: 'threading-wax', name: 'Waxing Full Face', evanstonPrice: 3000, chicagoPrice: 3500, duration: 20, styleTags: ['waxing'], sortOrder: 2 },
    { category: 'threading-wax', name: 'Nose Wax', evanstonPrice: 1000, chicagoPrice: 1200, duration: 10, styleTags: ['waxing'], sortOrder: 3 },
  ];

  const evanstonServices = serviceTemplates.map(s => ({
    salonId: salon._id,
    locationId: evanston._id,
    category: s.category,
    name: s.name,
    description: s.description,
    price: s.evanstonPrice,
    priceVaries: s.priceVaries || false,
    duration: s.duration,
    styleTags: s.styleTags,
    sortOrder: s.sortOrder,
  }));

  const chicagoServices = serviceTemplates.map(s => ({
    salonId: salon._id,
    locationId: chicago._id,
    category: s.category,
    name: s.name,
    description: s.description,
    price: s.chicagoPrice,
    priceVaries: s.priceVaries || false,
    duration: s.duration,
    styleTags: s.styleTags,
    sortOrder: s.sortOrder,
  }));

  const services = await Service.insertMany([...evanstonServices, ...chicagoServices]);

  // ── Sample Clients ──
  const clients = await Client.insertMany([
    { salonId: salon._id, firstName: 'Adam', lastName: 'Bissonnette', phone: '+13125551001', email: 'adam.b@email.com', visitCount: 8, hairType: 'straight', source: 'booksy-import', lastVisit: dayjs().subtract(15, 'day').toDate(), preferredBarberId: ahmad._id },
    { salonId: salon._id, firstName: 'Maria', lastName: 'Rodriguez', phone: '+13125551002', email: 'maria.r@email.com', visitCount: 12, hairType: 'curly', source: 'booksy-import', lastVisit: dayjs().subtract(5, 'day').toDate(), preferredBarberId: shamiram._id },
    { salonId: salon._id, firstName: 'James', lastName: 'Chen', phone: '+13125551003', email: 'james.c@email.com', visitCount: 5, hairType: 'straight', source: 'booksy-import', lastVisit: dayjs().subtract(42, 'day').toDate(), preferredBarberId: lucky._id },
    { salonId: salon._id, firstName: 'Sophia', lastName: 'Williams', phone: '+13125551004', email: 'sophia.w@email.com', visitCount: 3, hairType: 'wavy', source: 'booking-form', lastVisit: dayjs().subtract(74, 'day').toDate(), preferredBarberId: oskar._id },
    { salonId: salon._id, firstName: 'Michael', lastName: 'Johnson', phone: '+13125551005', email: 'mike.j@email.com', visitCount: 15, hairType: 'curly', source: 'booksy-import', lastVisit: dayjs().subtract(105, 'day').toDate(), preferredBarberId: marcus._id },
  ]);

  // ── Sample Appointments (this week) ──
  const today = dayjs();
  const weekStart = today.startOf('week');

  const evanstonMenscut = services.find(s => s.name === "Men's Barber Style Cut" && s.locationId.equals(evanston._id));
  const evanstonWomenscut = services.find(s => s.name === "Women's Haircut" && s.locationId.equals(evanston._id));
  const evanstonBalayage = services.find(s => s.name === "Balayage" && s.locationId.equals(evanston._id));
  const evanstonBeard = services.find(s => s.name === "Beard Trim - Straight Razor" && s.locationId.equals(evanston._id));
  const evanstonBlowdry = services.find(s => s.name === "Blow Dry" && s.locationId.equals(evanston._id));

  const chicagoMenscut = services.find(s => s.name === "Men's Barber Style Cut" && s.locationId.equals(chicago._id));
  const chicagoWomenscut = services.find(s => s.name === "Women's Haircut" && s.locationId.equals(chicago._id));

  await Appointment.insertMany([
    // Evanston Monday
    { salonId: salon._id, locationId: evanston._id, clientId: clients[0]._id, barberId: ahmad._id, serviceId: evanstonMenscut._id, date: weekStart.add(1, 'day').format('YYYY-MM-DD'), startTime: '09:00', endTime: '09:30', status: 'confirmed', source: 'online', haircutStyle: 'skin-fade', totalPrice: 4500 },
    { salonId: salon._id, locationId: evanston._id, clientId: clients[1]._id, barberId: shamiram._id, serviceId: evanstonBalayage._id, date: weekStart.add(1, 'day').format('YYYY-MM-DD'), startTime: '10:00', endTime: '12:15', status: 'confirmed', source: 'online', haircutStyle: 'balayage', totalPrice: 28500 },
    { salonId: salon._id, locationId: evanston._id, clientId: clients[4]._id, barberId: lucky._id, serviceId: evanstonMenscut._id, date: weekStart.add(1, 'day').format('YYYY-MM-DD'), startTime: '11:00', endTime: '11:30', status: 'confirmed', source: 'phone', haircutStyle: 'classic', totalPrice: 4500 },
    // Evanston Tuesday
    { salonId: salon._id, locationId: evanston._id, clientId: clients[2]._id, barberId: ahmad._id, serviceId: evanstonMenscut._id, date: weekStart.add(2, 'day').format('YYYY-MM-DD'), startTime: '08:30', endTime: '09:00', status: 'confirmed', source: 'online', haircutStyle: 'fade', totalPrice: 4500 },
    { salonId: salon._id, locationId: evanston._id, clientId: clients[3]._id, barberId: oskar._id, serviceId: evanstonWomenscut._id, date: weekStart.add(2, 'day').format('YYYY-MM-DD'), startTime: '10:00', endTime: '11:00', status: 'confirmed', source: 'online', haircutStyle: 'styling', totalPrice: 7500 },
    // Evanston Wednesday
    { salonId: salon._id, locationId: evanston._id, clientId: clients[0]._id, barberId: lucky._id, serviceId: evanstonBeard._id, date: weekStart.add(3, 'day').format('YYYY-MM-DD'), startTime: '14:00', endTime: '14:25', status: 'confirmed', source: 'walk-in', haircutStyle: 'beard', totalPrice: 4000 },
    { salonId: salon._id, locationId: evanston._id, clientId: clients[1]._id, barberId: oskar._id, serviceId: evanstonBlowdry._id, date: weekStart.add(3, 'day').format('YYYY-MM-DD'), startTime: '13:00', endTime: '13:45', status: 'confirmed', source: 'phone', haircutStyle: 'blowout', totalPrice: 5500 },
    // Evanston Thursday
    { salonId: salon._id, locationId: evanston._id, clientId: clients[4]._id, barberId: ahmad._id, serviceId: evanstonMenscut._id, date: weekStart.add(4, 'day').format('YYYY-MM-DD'), startTime: '09:00', endTime: '09:30', status: 'confirmed', source: 'online', haircutStyle: 'skin-fade', totalPrice: 4500 },
    { salonId: salon._id, locationId: evanston._id, clientId: clients[3]._id, barberId: shamiram._id, serviceId: evanstonWomenscut._id, date: weekStart.add(4, 'day').format('YYYY-MM-DD'), startTime: '15:00', endTime: '16:00', status: 'confirmed', source: 'online', haircutStyle: 'styling', totalPrice: 7500 },
    // Evanston Friday
    { salonId: salon._id, locationId: evanston._id, clientId: clients[2]._id, barberId: lucky._id, serviceId: evanstonMenscut._id, date: weekStart.add(5, 'day').format('YYYY-MM-DD'), startTime: '10:00', endTime: '10:30', status: 'confirmed', source: 'instagram', haircutStyle: 'classic', totalPrice: 4500 },

    // Chicago Monday (Marcus & Elena)
    { salonId: salon._id, locationId: chicago._id, clientId: clients[0]._id, barberId: marcus._id, serviceId: chicagoMenscut._id, date: weekStart.add(1, 'day').format('YYYY-MM-DD'), startTime: '09:30', endTime: '10:00', status: 'confirmed', source: 'online', haircutStyle: 'fade', totalPrice: 6500 },
    { salonId: salon._id, locationId: chicago._id, clientId: clients[1]._id, barberId: elena._id, serviceId: chicagoWomenscut._id, date: weekStart.add(1, 'day').format('YYYY-MM-DD'), startTime: '11:00', endTime: '12:00', status: 'confirmed', source: 'online', haircutStyle: 'styling', totalPrice: 9500 },
    // Chicago Wednesday
    { salonId: salon._id, locationId: chicago._id, clientId: clients[3]._id, barberId: marcus._id, serviceId: chicagoMenscut._id, date: weekStart.add(3, 'day').format('YYYY-MM-DD'), startTime: '15:00', endTime: '15:30', status: 'confirmed', source: 'walk-in', haircutStyle: 'skin-fade', totalPrice: 6500 },
  ]);

  console.log('✅ Seed complete!');
  console.log(`   Salon: ${salon.name}`);
  console.log(`   Locations: Chicago, Evanston`);
  console.log(`   Barbers: Lucky, Oskar, Shamiram, Ahmad (Evanston) | Marcus, Elena (Chicago)`);
  console.log(`   Services: ${services.length} (across both locations)`);
  console.log(`   Clients: ${clients.length}`);
  console.log(`   Appointments: 13 sample`);
  console.log(`\n   Salon ID: ${salon._id}`);
  console.log(`   Evanston Location ID: ${evanston._id}`);
  console.log(`   Chicago Location ID: ${chicago._id}`);

  // ── Default Pre-Appointment Cadence ──
  const cadence = await Cadence.create({
    salonId: salon._id,
    name: 'Pre-Appointment Reminders',
    type: 'pre-appointment',
    isActive: true,
    steps: [
      {
        order: 1,
        channel: 'sms',
        delayValue: 48,
        delayUnit: 'hours',
        delayDirection: 'before',
        messageTemplate: 'Hi {{firstName}}, this is a friendly reminder from Elegance Salon. You have an appointment for {{serviceName}} with {{barberName}} on {{date}} at {{time}}. We look forward to seeing you!',
      },
      {
        order: 2,
        channel: 'sms',
        delayValue: 24,
        delayUnit: 'hours',
        delayDirection: 'before',
        messageTemplate: 'Hi {{firstName}}, your {{serviceName}} appointment with {{barberName}} is tomorrow at {{time}}. Reply YES to confirm or call us to reschedule. Reply STOP to opt out.',
      },
      {
        order: 3,
        channel: 'sms',
        delayValue: 2,
        delayUnit: 'hours',
        delayDirection: 'before',
        messageTemplate: 'Hi {{firstName}}, just a heads up — your appointment at Elegance Salon ({{locationName}}) is in 2 hours at {{time}}. See you soon!',
      },
    ],
  });
  console.log(`   Cadence: "${cadence.name}" (${cadence.steps.length} steps)`);

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
