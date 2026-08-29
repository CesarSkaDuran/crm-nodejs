import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FacturacionElectronica } from './entities/facturacion-electronica.entity';
import { ConfigurarFacturacionDto, EmitirFacturaDto } from './dto/facturacion-electronica.dto';
import { Sale } from '../sales/entities/sale.entity';
import { SaleDetail } from '../sales/entities/sale-detail.entity';
import { Third } from '../thirds/entities/third.entity';
import { Company } from '../companies/entities/company.entity';

@Injectable()
export class FacturacionElectronicaService {
  constructor(
    @InjectRepository(FacturacionElectronica)
    private readonly configRepo: Repository<FacturacionElectronica>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepo: Repository<SaleDetail>,
    @InjectRepository(Third)
    private readonly thirdRepo: Repository<Third>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  /**
   * Configura los datos de facturación electrónica de la empresa
   */
  async configurar(dto: ConfigurarFacturacionDto, empresaId: number) {
    let config = await this.configRepo.findOne({ where: { empresa_id: empresaId } });
    if (config) {
      Object.assign(config, dto);
    } else {
      config = this.configRepo.create({ ...dto, empresa_id: empresaId, estado: 1 });
    }
    return this.configRepo.save(config);
  }

  /**
   * Obtiene la configuración actual
   */
  async getConfig(empresaId: number) {
    const config = await this.configRepo.findOne({ where: { empresa_id: empresaId } });
    if (!config) {
      return { configurado: false };
    }
    return {
      configurado: true,
      ...config,
      consecutivo_actual: config.ultimo_consecutivo + 1,
      consecutivos_disponibles: config.rango_fin - config.ultimo_consecutivo,
    };
  }

  /**
   * Emite una factura electrónicamente a la DIAN
   */
  async emitir(dto: EmitirFacturaDto, empresaId: number) {
    const config = await this.configRepo.findOne({ where: { empresa_id: empresaId, estado: 1 } });
    if (!config) {
      throw new BadRequestException('No hay configuración de facturación electrónica. Configure primero los datos de la DIAN.');
    }

    if (config.ultimo_consecutivo >= config.rango_fin) {
      throw new BadRequestException('Se agotó el rango de consecutivos de facturación electrónica. Solicite un nuevo rango a la DIAN.');
    }

    const venta = await this.saleRepo.findOne({
      where: { id: dto.venta_id, empresa_id: empresaId },
      relations: ['cliente'],
    });
    if (!venta) {
      throw new NotFoundException('Venta no encontrada');
    }

    const detalles = await this.saleDetailRepo.find({
      where: { venta_id: venta.id },
      relations: ['producto'],
    });

    if (detalles.length === 0) {
      throw new BadRequestException('La venta no tiene detalles para facturar');
    }

    const empresa = await this.companyRepo.findOneBy({ id: empresaId });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    const cliente = venta.cliente;
    if (!cliente) {
      throw new BadRequestException('La venta no tiene cliente asignado');
    }

    // Construir el JSON UBL 2.1 para la DIAN
    const consecutivo = config.ultimo_consecutivo + 1;
    const numeroFactura = `${config.prefijo}${consecutivo.toString().padStart(6, '0')}`;

    const invoice = {
      number: consecutivo,
      type_document_id: 1,
      date: venta.fecha,
      time: new Date().toTimeString().split(' ')[0],
      resolution_number: config.resolucion,
      prefix: config.prefijo,
      sendmail: false,
      customer: {
        identification_number: this.limpiarDocumento(cliente.documento),
        name: `${cliente.nombre} ${cliente.apellido || ''}`.trim(),
        phone: Number(cliente.telefono) || 0,
        address: cliente.direccion || '',
        email: cliente.email || '',
        merchant_registration: '0000000-00',
        type_document_identification_id: cliente.tipo_documento || 13,
        type_organization_id: cliente.tipo_naturaleza === 2 ? 1 : 2,
        municipality_id: cliente.ciudad || '149',
        type_regime_id: cliente.regimen || 2,
      },
      payment_form: {
        payment_form_id: venta.modo || 1,
        payment_method_id: venta.forma || 10,
        payment_due_date: venta.fecha,
        duration_measure: venta.modo === 2 ? '30' : '0',
      },
      allowance_charges: [
        {
          discount_id: 1,
          charge_indicator: false,
          allowance_charge_reason: 'DESCUENTO GENERAL',
          amount: '0.00',
          base_amount: String(venta.base_grava || 0),
        },
      ],
      legal_monetary_totals: {
        line_extension_amount: String(venta.base_grava || 0),
        tax_exclusive_amount: venta.retencion ? String(venta.base_grava || 0) : '0.00',
        tax_inclusive_amount: String(venta.total || 0),
        allowance_total_amount: '0.00',
        charge_total_amount: '0.00',
        payable_amount: String(venta.total || 0),
      },
      tax_totals: [
        {
          tax_id: 1,
          tax_amount: String(venta.impuesto || 0),
          percent: String(detalles[0]?.producto?.impuesto || 19),
          taxable_amount: String(venta.base_grava || 0),
        },
      ],
      invoice_lines: detalles.map((d, i) => ({
        id: i + 1,
        unit_measure_id: 70, // unidad
        invoiced_quantity: String(d.cantidad),
        line_extension_amount: String(d.subtotal || 0),
        free_of_charge_indicator: false,
        allowance_charges: [
          {
            charge_indicator: false,
            allowance_charge_reason: 'DESCUENTO GENERAL',
            amount: '0.00',
            base_amount: String(Number(d.subtotal || 0) + Number(d.impuesto || 0)),
          },
        ],
        tax_totals: [
          {
            tax_id: 1,
            tax_amount: String(d.impuesto || 0),
            taxable_amount: String(d.subtotal || 0),
            percent: String(d.producto?.impuesto || 19),
          },
        ],
        description: d.producto?.nombre || 'Producto',
        code: d.producto?.codigo || '',
        type_item_identification_id: 4,
        price_amount: String(d.precio_unitario || 0),
        base_quantity: '1',
      })),
    };

    try {
      // Enviar a la API de la DIAN
      const response = await fetch(config.api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${config.token}`,
        },
        body: JSON.stringify(invoice),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new BadRequestException(`Error DIAN (HTTP ${response.status}): ${errorText}`);
      }

      const result: any = await response.json();

      // Verificar validez
      const isValid = this.verificarValidez(result);
      if (!isValid.valid) {
        throw new BadRequestException(`DIAN rechazó la factura: ${isValid.mensaje}`);
      }

      // Guardar datos de la factura electrónica
      config.ultimo_consecutivo = consecutivo;
      await this.configRepo.save(config);

      // Actualizar la venta con los datos electrónicos
      (venta as any).cufe = result.cufe || result.ResponseDian?.Envelope?.Body?.SendBillSyncResponse?.SendBillSyncResult?.Cufe;
      (venta as any).pdf_link = config.company_link ? config.company_link + (result.urlinvoicepdf || '') : result.urlinvoicepdf || '';
      (venta as any).numero_factura_electronica = numeroFactura;
      (venta as any).json_facturacion = JSON.stringify(invoice);
      await this.saleRepo.save(venta);

      return {
        ok: true,
        venta_id: venta.id,
        numero_factura: numeroFactura,
        cufe: (venta as any).cufe,
        pdf_link: (venta as any).pdf_link,
        respuesta_dian: result,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Error de conexión con la DIAN: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Obtiene el estado de las facturas electrónicas emitidas
   */
  async estado(empresaId: number) {
    const config = await this.configRepo.findOne({ where: { empresa_id: empresaId } });
    if (!config) {
      return { configurado: false };
    }

    const ventasEmitidas = await this.saleRepo.count({
      where: { empresa_id: empresaId } as any,
    });

    return {
      configurado: true,
      resolucion: config.resolucion,
      prefijo: config.prefijo,
      rango_inicio: config.rango_inicio,
      rango_fin: config.rango_fin,
      ultimo_consecutivo: config.ultimo_consecutivo,
      consecutivos_usados: config.ultimo_consecutivo - config.rango_inicio + 1,
      consecutivos_disponibles: config.rango_fin - config.ultimo_consecutivo,
      fecha_vencimiento: config.fecha_vencimiento,
      estado: config.estado,
    };
  }

  private limpiarDocumento(doc: string | null | undefined): number {
    if (!doc) return 0;
    const limpio = doc.replace(/[^0-9]/g, '');
    return Number(limpio) || 0;
  }

  private verificarValidez(result: any): { valid: boolean; mensaje: string } {
    // Estructura de respuesta de apidian2020
    if (result?.ResponseDian?.Envelope?.Body?.SendBillSyncResponse?.SendBillSyncResult?.IsValid === 'false') {
      return {
        valid: false,
        mensaje: result.ResponseDian.Envelope.Body.SendBillSyncResponse.SendBillSyncResult.ErrorMessage || 'Invalid',
      };
    }
    if (result?.cufe || result?.CUFE) {
      return { valid: true, mensaje: 'OK' };
    }
    return { valid: true, mensaje: 'OK' };
  }
}
