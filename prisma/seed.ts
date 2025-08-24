import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // 1. Crear urbanización
  const urb = await prisma.urbanization.upsert({
    where: { name: 'Urbanización Test' },
    update: {},
    create: {
      id: 'urb-001',
      name: 'Urbanización Test',
      maxUsers: 100,
    },
  });
  console.log('✅ Urbanización creada:', urb.name);

  // 2. Crear sirena SRN-001
  const siren = await prisma.siren.upsert({
    where: { deviceId: 'SRN-001' },
    update: {},
    create: {
      id: 'siren-001',
      deviceId: 'SRN-001',
      apiKey: 'srn-001-api-key',
      urbanizationId: urb.id,
    },
  });
  console.log('✅ Sirena creada:', siren.deviceId);

  // 3. Crear usuarios
  const users = [
    {
      id: 'user-001',
      keycloakId: 'd5fe558e-89de-4bfb-ba6a-547317b97f18', // admin1
      email: 'admin1@test.local',
      username: 'admin1',
      role: Role.ADMIN,
      urbanizationId: urb.id,
    },
    {
      id: 'user-002',
      keycloakId: 'e81ab49c-c0aa-4756-8402-510e4556f578', // admin2
      email: 'admin2@test.local',
      username: 'admin2',
      role: Role.SUPERADMIN,
      urbanizationId: null,
    },
    {
      id: 'user-003',
      keycloakId: '4b2a65c9-4850-4bdf-bc12-97c665e2f721', // admin3
      email: 'admin3@test.local',
      username: 'admin3',
      role: Role.GUARDIA,
      urbanizationId: urb.id,
    },
    {
      id: 'user-004',
      keycloakId: '42187d4f-90d4-4fe6-8f6b-155918ff7e85', // admin4
      email: 'admin4@test.local',
      username: 'admin4',
      role: Role.RESIDENTE,
      urbanizationId: urb.id,
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
    console.log(`✅ Usuario creado: ${u.username} (${u.role})`);
  }

  // 4. Asignar sirena al residente (admin4)
  await prisma.assignment.upsert({
    where: {
      userId_sirenId: {
        userId: 'user-004',
        sirenId: siren.id,
      },
    },
    update: { active: true },
    create: {
      id: 'assign-001',
      userId: 'user-004',
      sirenId: siren.id,
      active: true,
    },
  });
  console.log('✅ Sirena asignada al residente admin4');

  console.log('🌱 Seed completado ✔');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
