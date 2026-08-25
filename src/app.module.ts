import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { UsersModule } from './users/users.module';
import { AccountsModule } from './accounts/accounts.module';
import { ThirdsModule } from './thirds/thirds.module';
import { ProductsModule } from './products/products.module';
import { PurchasesModule } from './purchases/purchases.module';
import { AccountingModule } from './accounting/accounting.module';
import { KardexModule } from './kardex/kardex.module';
import { TipoComprobantesModule } from './tipo-comprobantes/tipo-comprobantes.module';
import { BancosModule } from './bancos/bancos.module';
import { TesoreriaModule } from './tesoreria/tesoreria.module';
import { SalesModule } from './sales/sales.module';
import { CarteraModule } from './cartera/cartera.module';
import { CuentasPorPagarModule } from './cuentas-por-pagar/cuentas-por-pagar.module';
import { InformesModule } from './informes/informes.module';
import { CategoriasModule } from './categorias/categorias.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get<string>('DB_USERNAME', 'crm_user'),
        password: config.get<string>('DB_PASSWORD', 'crm_pass'),
        database: config.get<string>('DB_DATABASE', 'crm_db'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: config.get<string>('NODE_ENV') === 'development',
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),
    AuthModule,
    CompaniesModule,
    ProductsModule,
    PurchasesModule,
    UsersModule,
    ThirdsModule,
    AccountsModule,
    AccountingModule,
    KardexModule,
    TipoComprobantesModule,
    BancosModule,
    TesoreriaModule,
    SalesModule,
    CarteraModule,
    CuentasPorPagarModule,
    InformesModule,
    CategoriasModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
