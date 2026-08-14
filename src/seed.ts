import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Company } from './companies/entities/company.entity';
import { User, UserRole } from './users/entities/user.entity';

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  database: process.env.DB_DATABASE || 'crm_db',
  entities: [Company, User],
  synchronize: true,
});

async function seed() {
  await dataSource.initialize();

  const empresaRepo = dataSource.getRepository(Company);
  const usuarioRepo = dataSource.getRepository(User);

  let empresa = await empresaRepo.findOne({ where: { codigo: 'DEMO' } });

  if (!empresa) {
    empresa = await empresaRepo.save({
      codigo: 'DEMO',
      nombre: 'Empresa Demo S.A.S.',
      nit: '900000000',
      dv: '7',
      ciudad: 'Cucuta',
      estado: 1,
    });
    console.log('Empresa DEMO creada.');
  } else {
    console.log('La empresa DEMO ya existe.');
  }

  const existeUsuario = await usuarioRepo.findOne({
    where: { email: 'admin@demo.com', empresa_id: empresa.id },
  });

  if (!existeUsuario) {
    await usuarioRepo.save({
      empresa_id: empresa.id,
      nombre: 'Administrador',
      email: 'admin@demo.com',
      password: await bcrypt.hash('admin123', 10),
      rol: UserRole.ADMIN,
      estado: 1,
    });
    console.log('Usuario creado: admin@demo.com / admin123');
  } else {
    console.log('El usuario admin@demo.com ya existe.');
  }

  console.log('Codigo empresa: DEMO');

  await dataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

