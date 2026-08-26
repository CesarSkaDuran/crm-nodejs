const BASE = 'http://localhost:3000/api/v1';

async function main() {
  const loginRes = await fetch(`${BASE}/autenticacion/iniciar-sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigo_empresa: 'DEMO',
      email: 'admin@demo.com',
      password: 'admin123',
    }),
  });
  const { access_token } = await loginRes.json();
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` };

  // Buscar cuenta 1.1 (Disponible)
  const cuentasRes = await fetch(`${BASE}/cuentas?limit=600`, { headers: auth });
  const cuentasBody = await cuentasRes.json();
  const cuentas = Array.isArray(cuentasBody) ? cuentasBody : (cuentasBody.data || []);
  const cuentaDisponible = cuentas.find((c) => c.codigo === '1.1');
  console.log('Cuenta 1.1:', cuentaDisponible?.id, cuentaDisponible?.codigo, cuentaDisponible?.nombre);

  // Generar libro auxiliar en modo resumido
  const libroRes = await fetch(`${BASE}/informes/libro?cuenta_id=${cuentaDisponible.id}&modo=resumido`, { headers: auth });
  const libro = await libroRes.json();
  console.log('\nLibro auxiliar 1.1 - Disponible (resumido):');
  console.log('Total débito:', libro.total_debito);
  console.log('Total crédito:', libro.total_credito);
  console.log('Saldo final:', libro.saldo_final);
  console.log('\nDetalle por cuenta:');
  for (const row of libro.data) {
    console.log(`  ${row.cuenta.codigo} ${row.cuenta.nombre}: D=${row.debito} C=${row.credito} saldo=${row.saldo} directo=${row.saldoDirecto} ${row.esPadre ? '[PADRE]' : '[AUX]'}`);
  }
}

main().catch(console.error);
