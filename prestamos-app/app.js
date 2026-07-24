// app.js - logica de la interfaz (SPA sin frameworks)

const state = {
  view: 'inicio',
  clientes: [],
  prestamos: [],
  dashboard: null,
};

// ---------- Helpers generales ----------

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(url, opts);
  if (resp.status === 204) return null;
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Ocurrio un error');
  return data;
}

function moneda(n) {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fechaFmt(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function badgeEstadoCuota(estadoVisual) {
  const mapa = {
    vencida: ['Vencida', 'badge-vencida'],
    hoy: ['Vence hoy', 'badge-hoy'],
    proxima: ['Próxima', 'badge-proxima'],
    pendiente: ['Pendiente', 'badge-pendiente'],
    pagada: ['Pagada', 'badge-pagada'],
  };
  const [txt, cls] = mapa[estadoVisual] || ['—', 'badge-pendiente'];
  return `<span class="badge ${cls}">${txt}</span>`;
}

function badgeEstadoPrestamo(estado, tieneVencidas) {
  if (estado === 'pagado') return '<span class="badge badge-pagada">Pagado</span>';
  if (estado === 'cancelado') return '<span class="badge badge-cancelado">Cancelado</span>';
  if (tieneVencidas) return '<span class="badge badge-vencida">Con atraso</span>';
  return '<span class="badge badge-activo">Activo</span>';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), 2400);
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Modal ----------

function openModal(title, bodyHtml, onMount) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
  if (onMount) onMount(document.getElementById('modal-body'));
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

function confirmarAccion(mensaje, textoBoton, onConfirm) {
  openModal('Confirmar', `
    <p style="margin-top:0">${escapeHtml(mensaje)}</p>
    <div class="item-actions">
      <button class="btn btn-secundario" id="conf-cancelar" style="flex:1">Cancelar</button>
      <button class="btn btn-peligro" id="conf-ok" style="flex:1">${escapeHtml(textoBoton)}</button>
    </div>
  `, (body) => {
    body.querySelector('#conf-cancelar').onclick = closeModal;
    body.querySelector('#conf-ok').onclick = () => { closeModal(); onConfirm(); };
  });
}

document.getElementById('modal-cerrar').onclick = closeModal;
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

document.getElementById('btn-ayuda').onclick = () => {
  openModal('¿Cómo funciona?', `
    <div class="help-box" style="margin-bottom:10px">
      <b>1. Cargá tus clientes</b><br>Nombre, DNI y teléfono (con código de área, para poder mandarle WhatsApp).
    </div>
    <div class="help-box" style="margin-bottom:10px">
      <b>2. Creá un préstamo</b><br>Elegís el cliente, cuánto le prestás y el interés. Si es en cuotas, el sistema arma automáticamente las fechas de cada una.
    </div>
    <div class="help-box" style="margin-bottom:10px">
      <b>3. Mirá el Inicio todos los días</b><br>Ahí vas a ver quién te tiene que pagar hoy o está atrasado.
    </div>
    <div class="help-box" style="margin-bottom:10px">
      <b>4. Mandá el recordatorio</b><br>Apretás "Recordar por WhatsApp" y se abre WhatsApp con el mensaje ya escrito, listo para enviar.
    </div>
    <div class="help-box" style="margin-bottom:10px">
      <b>5. Marcá cuando te pagan</b><br>Apretás "Marcar como pagado" y listo, queda registrado.
    </div>
    <div class="help-box">
      <b>6. Recibí pedidos de préstamo sin responder mensajes</b><br>En la pestaña "Solicitudes" tenés un link para compartir. Quien te pide un préstamo completa sus datos ahí, y vos solo entrás a aceptar o rechazar.
    </div>
  `);
};

// ---------- Navegacion ----------

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => cambiarVista(btn.dataset.view));
});

async function cambiarVista(view) {
  state.view = view;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  await render();
}

async function render() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="empty-state">Cargando...</div>';
  try {
    if (state.view === 'inicio') await renderInicio(app);
    else if (state.view === 'clientes') await renderClientes(app);
    else if (state.view === 'prestamos') await renderPrestamos(app);
    else if (state.view === 'solicitudes') await renderSolicitudes(app);
  } catch (err) {
    app.innerHTML = `<div class="empty-state">⚠️ ${escapeHtml(err.message)}</div>`;
  }
  actualizarBadgeSolicitudes();
}

async function actualizarBadgeSolicitudes() {
  try {
    const solicitudes = await api('GET', '/api/solicitudes');
    const pendientes = solicitudes.filter((s) => s.estado === 'pendiente').length;
    const badge = document.getElementById('badge-solicitudes');
    badge.textContent = pendientes;
    badge.classList.toggle('hidden', pendientes === 0);
  } catch (err) {
    // si falla, no mostramos badge, no es critico
  }
}

// ---------- Vista: Inicio ----------

async function renderInicio(app) {
  const d = await api('GET', '/api/dashboard');
  state.dashboard = d;

  const filas = d.proximos_vencimientos.map((c) => filaVencimiento(c)).join('') ||
    `<div class="empty-state"><span class="emoji">🎉</span>No hay cobros pendientes por ahora.</div>`;

  app.innerHTML = `
    <div class="resumen-grid">
      <div class="resumen-card destacado">
        <div class="label">Total invertido (capital activo)</div>
        <div class="valor">${moneda(d.total_invertido)}</div>
      </div>
      <div class="resumen-card destacado">
        <div class="label">Ganancia proyectada</div>
        <div class="valor">${moneda(d.ganancia_proyectada)}</div>
      </div>
      <div class="resumen-card ok">
        <div class="label">Ganancia ya cobrada</div>
        <div class="valor">${moneda(d.ganancia_cobrada)}</div>
      </div>
      <div class="resumen-card">
        <div class="label">Por cobrar (total)</div>
        <div class="valor">${moneda(d.por_cobrar)}</div>
      </div>
      <div class="resumen-card ${d.vence_hoy > 0 ? 'alerta' : ''}">
        <div class="label">Vence hoy</div>
        <div class="valor">${moneda(d.vence_hoy)}</div>
      </div>
      <div class="resumen-card ${d.vencido > 0 ? 'alerta' : ''}">
        <div class="label">Atrasado</div>
        <div class="valor">${moneda(d.vencido)}</div>
      </div>
    </div>

    <div class="section-title">📅 Próximos cobros</div>
    <div id="lista-vencimientos">${filas}</div>
  `;

  cablearFilasVencimiento(app);
}

function filaVencimiento(c) {
  return `
    <div class="item-card" data-cuota-id="${c.id}">
      <div class="item-card-top">
        <div>
          <div class="item-nombre">${escapeHtml(c.cliente_nombre)}</div>
          <div class="item-sub">Vence: ${fechaFmt(c.fecha_vencimiento)}${c.numero ? ' · Cuota N°' + c.numero : ''}</div>
        </div>
        <div>
          <div class="item-monto">${moneda(c.monto)}</div>
          <div style="text-align:right;margin-top:4px">${badgeEstadoCuota(c.estado_visual)}</div>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-whatsapp btn-recordar" data-id="${c.id}">📲 Recordar por WhatsApp</button>
        <button class="btn btn-exito btn-marcar-pagado" data-id="${c.id}">✅ Marcar como pagado</button>
      </div>
    </div>
  `;
}

function cablearFilasVencimiento(scope) {
  scope.querySelectorAll('.btn-recordar').forEach((btn) => {
    btn.onclick = () => recordarWhatsApp(btn.dataset.id);
  });
  scope.querySelectorAll('.btn-marcar-pagado').forEach((btn) => {
    btn.onclick = () => marcarComoPagado(btn.dataset.id);
  });
}

async function recordarWhatsApp(cuotaId) {
  try {
    const r = await api('GET', `/api/cuotas/${cuotaId}/whatsapp`);
    window.open(r.link, '_blank');
  } catch (err) {
    showToast('⚠️ ' + err.message + ' (revisá el teléfono del cliente)');
  }
}

function marcarComoPagado(cuotaId) {
  confirmarAccion('¿Confirmás que esta cuota fue pagada?', 'Sí, marcar como pagada', async () => {
    try {
      await api('PUT', `/api/cuotas/${cuotaId}/pagar`, {});
      showToast('✅ Pago registrado');
      await render();
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  });
}

function deshacerPago(cuotaId) {
  confirmarAccion('¿Deshacer este pago y volver a marcarlo como pendiente?', 'Sí, deshacer', async () => {
    try {
      await api('PUT', `/api/cuotas/${cuotaId}/deshacer`, {});
      showToast('Pago deshecho');
      await render();
      if (document.getElementById('modal-overlay').classList.contains('hidden') === false) closeModal();
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  });
}

// ---------- Vista: Clientes ----------

function categoriaCliente(c) {
  if (c.saldo_vencido > 0) return 'atrasados';
  if (c.saldo_pendiente > 0) return 'al_dia';
  return 'sin_deuda';
}

async function renderClientes(app) {
  const clientes = await api('GET', '/api/clientes');
  state.clientes = clientes;

  const cantAtrasados = clientes.filter((c) => categoriaCliente(c) === 'atrasados').length;
  const cantAlDia = clientes.filter((c) => categoriaCliente(c) === 'al_dia').length;
  const cantSinDeuda = clientes.filter((c) => categoriaCliente(c) === 'sin_deuda').length;

  app.innerHTML = `
    <div class="search-box"><input type="text" id="buscar-cliente" placeholder="🔎 Buscar cliente por nombre o DNI..."></div>
    <div class="filtro-chips" id="filtro-chips">
      <div class="chip selected" data-filtro="todos">Todos (${clientes.length})</div>
      <div class="chip chip-rojo" data-filtro="atrasados">🔴 Atrasados (${cantAtrasados})</div>
      <div class="chip chip-amarillo" data-filtro="al_dia">🟡 Al día (${cantAlDia})</div>
      <div class="chip chip-verde" data-filtro="sin_deuda">🟢 Sin deuda (${cantSinDeuda})</div>
    </div>
    <div id="lista-clientes"></div>
    <button class="fab" id="fab-nuevo-cliente" title="Nuevo cliente">+</button>
  `;

  let filtroActivo = 'todos';

  function pintar(filtroTexto) {
    const f = (filtroTexto || '').toLowerCase();
    const orden = { atrasados: 0, al_dia: 1, sin_deuda: 2 };
    const filtrados = clientes
      .filter((c) => c.nombre.toLowerCase().includes(f) || (c.dni || '').toLowerCase().includes(f))
      .filter((c) => filtroActivo === 'todos' || categoriaCliente(c) === filtroActivo)
      .sort((a, b) => {
        const diff = orden[categoriaCliente(a)] - orden[categoriaCliente(b)];
        return diff !== 0 ? diff : a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
      });
    const cont = document.getElementById('lista-clientes');
    if (filtrados.length === 0) {
      cont.innerHTML = `<div class="empty-state"><span class="emoji">👤</span>${clientes.length === 0 ? 'Todavía no cargaste clientes.<br>Apretá el botón + para agregar el primero.' : 'No hay clientes en esta categoría.'}</div>`;
      return;
    }
    cont.innerHTML = filtrados.map((c) => {
      const cat = categoriaCliente(c);
      return `
      <div class="item-card" data-cliente-id="${c.id}">
        <div class="item-card-top">
          <div>
            <div class="item-nombre">${escapeHtml(c.nombre)}</div>
            <div class="item-sub">${c.dni ? 'DNI ' + escapeHtml(c.dni) : 'Sin DNI cargado'}${c.telefono ? ' · ' + escapeHtml(c.telefono) : ''}</div>
          </div>
          <div style="text-align:right">
            <div class="item-monto">${moneda(c.saldo_pendiente)}</div>
            <div class="item-sub">por cobrar</div>
          </div>
        </div>
        <div style="margin-top:8px">
          ${cat === 'atrasados' ? `<span class="badge badge-vencida">🔴 Atrasado: ${moneda(c.saldo_vencido)}</span>` : ''}
          ${cat === 'al_dia' ? `<span class="badge badge-hoy">🟡 Al día</span>` : ''}
          ${cat === 'sin_deuda' ? `<span class="badge badge-pagada">🟢 Sin deuda pendiente</span>` : ''}
        </div>
      </div>
    `;
    }).join('');
    cont.querySelectorAll('[data-cliente-id]').forEach((el) => {
      el.onclick = () => abrirDetalleCliente(el.dataset.clienteId);
    });
  }

  pintar('');
  document.getElementById('buscar-cliente').addEventListener('input', (e) => pintar(e.target.value));
  document.getElementById('filtro-chips').querySelectorAll('.chip').forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll('#filtro-chips .chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      filtroActivo = chip.dataset.filtro;
      pintar(document.getElementById('buscar-cliente').value);
    };
  });
  document.getElementById('fab-nuevo-cliente').onclick = () => abrirFormCliente();
}

function abrirFormCliente(cliente) {
  const editando = !!cliente;
  openModal(editando ? 'Editar cliente' : 'Nuevo cliente', `
    <div class="campo">
      <label>Nombre completo *</label>
      <input type="text" id="f-nombre" value="${escapeHtml(cliente?.nombre || '')}" placeholder="Ej: Juan Pérez">
    </div>
    <div class="campo">
      <label>DNI</label>
      <input type="text" id="f-dni" value="${escapeHtml(cliente?.dni || '')}" placeholder="Ej: 30123456">
    </div>
    <div class="campo">
      <label>Teléfono (WhatsApp)</label>
      <input type="text" id="f-telefono" value="${escapeHtml(cliente?.telefono || '')}" placeholder="Ej: 011 15-1234-5678">
      <div class="campo-ayuda">Poné el número con código de área, como lo marcarías normalmente. El sistema lo ajusta solo para WhatsApp.</div>
    </div>
    <div class="campo">
      <label>Notas (opcional)</label>
      <textarea id="f-notas" rows="2" placeholder="Cualquier dato extra...">${escapeHtml(cliente?.notas || '')}</textarea>
    </div>
    <button class="btn btn-primario btn-full" id="f-guardar">💾 Guardar</button>
  `, (body) => {
    body.querySelector('#f-guardar').onclick = async () => {
      const nombre = body.querySelector('#f-nombre').value.trim();
      if (!nombre) { showToast('⚠️ Falta el nombre'); return; }
      const payload = {
        nombre,
        dni: body.querySelector('#f-dni').value.trim(),
        telefono: body.querySelector('#f-telefono').value.trim(),
        notas: body.querySelector('#f-notas').value.trim(),
      };
      try {
        if (editando) await api('PUT', `/api/clientes/${cliente.id}`, payload);
        else await api('POST', '/api/clientes', payload);
        closeModal();
        showToast('✅ Cliente guardado');
        await render();
      } catch (err) {
        showToast('⚠️ ' + err.message);
      }
    };
  });
}

async function abrirDetalleCliente(clienteId) {
  const cliente = await api('GET', `/api/clientes/${clienteId}`);
  const prestamosHtml = cliente.prestamos.length === 0
    ? `<div class="empty-state">Este cliente todavía no tiene préstamos.</div>`
    : cliente.prestamos.map((p) => {
      const cuotasHtml = p.cuotas.map((c) => `
        <div class="cuota-fila">
          <div class="cuota-info">
            <div>${p.tipo_pago === 'unico' ? 'Pago único' : 'Cuota N°' + c.numero} · ${fechaFmt(c.fecha_vencimiento)}</div>
            <div>${badgeEstadoCuota(c.estado_visual)}</div>
          </div>
          <div style="text-align:right">
            <div class="cuota-monto">${moneda(c.monto)}</div>
            ${c.estado === 'pendiente'
              ? `<button class="btn btn-exito" style="margin-top:6px" data-marcar="${c.id}">✅ Pagada</button>`
              : `<button class="btn btn-secundario" style="margin-top:6px" data-deshacer="${c.id}">↩️ Deshacer</button>`}
            ${c.estado === 'pendiente' ? `<button class="btn btn-whatsapp" style="margin-top:6px" data-recordar="${c.id}">📲</button>` : ''}
          </div>
        </div>
      `).join('');
      return `
      <div class="item-card">
        <div class="item-card-top">
          <div>
            <div class="item-nombre">${moneda(p.capital)} prestados</div>
            <div class="item-sub">${fechaFmt(p.fecha_inicio)} · ${p.tipo_pago === 'unico' ? 'Pago único' : p.num_cuotas + ' cuotas (' + p.frecuencia + ')'}</div>
          </div>
          <div>${badgeEstadoPrestamo(p.estado, p.cuotas.some(c => c.estado_visual === 'vencida'))}</div>
        </div>
        <div style="margin-top:8px">${cuotasHtml}</div>
      </div>
    `;
    }).join('');

  openModal(cliente.nombre, `
    <div class="campo-ayuda" style="margin-bottom:10px">
      ${cliente.dni ? 'DNI ' + escapeHtml(cliente.dni) : 'Sin DNI'} ${cliente.telefono ? '· 📞 ' + escapeHtml(cliente.telefono) : ''}
    </div>
    ${cliente.notas ? `<div class="help-box">${escapeHtml(cliente.notas)}</div>` : ''}
    <div class="item-actions" style="margin-bottom:14px">
      <button class="btn btn-secundario" id="c-editar" style="flex:1">✏️ Editar</button>
      <button class="btn btn-peligro" id="c-borrar" style="flex:1">🗑️ Eliminar</button>
    </div>
    <div class="section-title" style="margin-top:0">Préstamos y cuotas</div>
    ${prestamosHtml}
  `, (body) => {
    body.querySelector('#c-editar').onclick = () => abrirFormCliente(cliente);
    body.querySelector('#c-borrar').onclick = () => {
      confirmarAccion('Esto va a borrar al cliente y todos sus préstamos. ¿Estás seguro?', 'Sí, eliminar', async () => {
        await api('DELETE', `/api/clientes/${clienteId}`);
        closeModal();
        showToast('Cliente eliminado');
        await render();
      });
    };
    body.querySelectorAll('[data-marcar]').forEach((b) => {
      b.onclick = async () => {
        await api('PUT', `/api/cuotas/${b.dataset.marcar}/pagar`, {});
        showToast('✅ Pago registrado');
        closeModal();
        await abrirDetalleCliente(clienteId);
      };
    });
    body.querySelectorAll('[data-deshacer]').forEach((b) => {
      b.onclick = async () => {
        await api('PUT', `/api/cuotas/${b.dataset.deshacer}/deshacer`, {});
        showToast('Pago deshecho');
        closeModal();
        await abrirDetalleCliente(clienteId);
      };
    });
    body.querySelectorAll('[data-recordar]').forEach((b) => {
      b.onclick = () => recordarWhatsApp(b.dataset.recordar);
    });
  });
}

// ---------- Vista: Prestamos ----------

async function renderPrestamos(app) {
  const prestamos = await api('GET', '/api/prestamos');
  state.prestamos = prestamos;

  app.innerHTML = `
    <div id="lista-prestamos"></div>
    <button class="fab" id="fab-nuevo-prestamo" title="Nuevo préstamo">+</button>
  `;

  const cont = document.getElementById('lista-prestamos');
  if (prestamos.length === 0) {
    cont.innerHTML = `<div class="empty-state"><span class="emoji">📄</span>Todavía no cargaste préstamos.<br>Apretá el botón + para crear el primero.</div>`;
  } else {
    cont.innerHTML = prestamos.map((p) => `
      <div class="item-card" data-prestamo-id="${p.id}">
        <div class="item-card-top">
          <div>
            <div class="item-nombre">${escapeHtml(p.cliente_nombre)}</div>
            <div class="item-sub">Prestó ${moneda(p.capital)} · Ganancia ${moneda(p.ganancia)}</div>
            <div class="item-sub">${p.tipo_pago === 'unico' ? 'Pago único' : p.num_cuotas + ' cuotas · ' + p.frecuencia}</div>
          </div>
          <div style="text-align:right">
            ${badgeEstadoPrestamo(p.estado, p.tiene_vencidas)}
            ${p.proxima_cuota ? `<div class="item-sub" style="margin-top:6px">Próx: ${fechaFmt(p.proxima_cuota.fecha_vencimiento)}</div>` : ''}
          </div>
        </div>
      </div>
    `).join('');
    cont.querySelectorAll('[data-prestamo-id]').forEach((el) => {
      el.onclick = () => abrirDetallePrestamo(el.dataset.prestamoId);
    });
  }

  document.getElementById('fab-nuevo-prestamo').onclick = () => abrirFormPrestamo();
}

async function abrirDetallePrestamo(prestamoId) {
  const p = await api('GET', `/api/prestamos/${prestamoId}`);
  const cuotasHtml = p.cuotas.map((c) => `
    <div class="cuota-fila">
      <div class="cuota-info">
        <div>${p.tipo_pago === 'unico' ? 'Pago único' : 'Cuota N°' + c.numero} · ${fechaFmt(c.fecha_vencimiento)}</div>
        <div>${badgeEstadoCuota(c.estado_visual)}</div>
      </div>
      <div style="text-align:right">
        <div class="cuota-monto">${moneda(c.monto)}</div>
        ${c.estado === 'pendiente'
          ? `<button class="btn btn-exito" style="margin-top:6px" data-marcar="${c.id}">✅ Pagada</button>`
          : `<button class="btn btn-secundario" style="margin-top:6px" data-deshacer="${c.id}">↩️ Deshacer</button>`}
        ${c.estado === 'pendiente' ? `<button class="btn btn-whatsapp" style="margin-top:6px" data-recordar="${c.id}">📲</button>` : ''}
      </div>
    </div>
  `).join('');

  openModal(`Préstamo a ${p.cliente_nombre}`, `
    <div class="resumen-grid" style="margin-bottom:14px">
      <div class="resumen-card"><div class="label">Capital prestado</div><div class="valor">${moneda(p.capital)}</div></div>
      <div class="resumen-card"><div class="label">Total a cobrar</div><div class="valor">${moneda(p.monto_total)}</div></div>
      <div class="resumen-card ok"><div class="label">Ganancia</div><div class="valor">${moneda(p.ganancia)}</div></div>
      <div class="resumen-card"><div class="label">Tasa</div><div class="valor">${p.tasa_interes}%</div></div>
    </div>
    ${p.notas ? `<div class="help-box">${escapeHtml(p.notas)}</div>` : ''}
    <div class="section-title" style="margin-top:0">Cuotas</div>
    ${cuotasHtml}
    <div class="item-actions" style="margin-top:14px">
      ${p.estado !== 'cancelado' ? `<button class="btn btn-secundario" id="p-cancelar" style="flex:1">🚫 Cancelar préstamo</button>` : ''}
      <button class="btn btn-peligro" id="p-borrar" style="flex:1">🗑️ Eliminar</button>
    </div>
  `, (body) => {
    body.querySelectorAll('[data-marcar]').forEach((b) => {
      b.onclick = async () => { await api('PUT', `/api/cuotas/${b.dataset.marcar}/pagar`, {}); showToast('✅ Pago registrado'); closeModal(); await render(); };
    });
    body.querySelectorAll('[data-deshacer]').forEach((b) => {
      b.onclick = () => deshacerPago(b.dataset.deshacer);
    });
    body.querySelectorAll('[data-recordar]').forEach((b) => {
      b.onclick = () => recordarWhatsApp(b.dataset.recordar);
    });
    const btnCancelar = body.querySelector('#p-cancelar');
    if (btnCancelar) btnCancelar.onclick = () => {
      confirmarAccion('¿Cancelar este préstamo? Las cuotas pendientes dejarán de contar como activas.', 'Sí, cancelar', async () => {
        await api('PUT', `/api/prestamos/${prestamoId}/cancelar`, {});
        closeModal();
        showToast('Préstamo cancelado');
        await render();
      });
    };
    body.querySelector('#p-borrar').onclick = () => {
      confirmarAccion('Esto borra el préstamo y todas sus cuotas para siempre. ¿Estás seguro?', 'Sí, eliminar', async () => {
        await api('DELETE', `/api/prestamos/${prestamoId}`);
        closeModal();
        showToast('Préstamo eliminado');
        await render();
      });
    };
  });
}

async function abrirFormPrestamo() {
  const clientes = await api('GET', '/api/clientes');
  const opcionesClientes = clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');

  openModal('Nuevo préstamo', `
    <div class="campo">
      <label>Cliente *</label>
      <select id="f-cliente">
        <option value="">-- Elegí un cliente --</option>
        ${opcionesClientes}
        <option value="__nuevo__">➕ Cargar cliente nuevo</option>
      </select>
    </div>
    <div id="f-cliente-nuevo-box" style="display:none">
      <div class="campo"><label>Nombre del cliente nuevo *</label><input type="text" id="f-nc-nombre" placeholder="Ej: Juan Pérez"></div>
      <div class="fila-2">
        <div class="campo"><label>DNI</label><input type="text" id="f-nc-dni"></div>
        <div class="campo"><label>Teléfono</label><input type="text" id="f-nc-telefono"></div>
      </div>
    </div>

    <div class="fila-2">
      <div class="campo">
        <label>Capital prestado *</label>
        <input type="number" id="f-capital" placeholder="Ej: 50000" min="0" step="0.01">
      </div>
      <div class="campo">
        <label>Interés (%) *</label>
        <input type="number" id="f-tasa" placeholder="Ej: 20" min="0" step="0.01">
      </div>
    </div>

    <div class="campo">
      <label>Forma de pago</label>
      <div class="radio-group">
        <div class="radio-opcion selected" data-tipo="unico">Pago único</div>
        <div class="radio-opcion" data-tipo="cuotas">En cuotas</div>
      </div>
    </div>

    <div id="f-cuotas-box" style="display:none">
      <div class="fila-2">
        <div class="campo">
          <label>Cantidad de cuotas</label>
          <input type="number" id="f-num-cuotas" value="4" min="2" step="1">
        </div>
        <div class="campo">
          <label>Frecuencia</label>
          <select id="f-frecuencia">
            <option value="semanal">Semanal</option>
            <option value="quincenal">Quincenal</option>
            <option value="mensual" selected>Mensual</option>
          </select>
        </div>
      </div>
    </div>

    <div class="campo">
      <label>Fecha del préstamo</label>
      <input type="date" id="f-fecha" value="${hoyISO()}">
    </div>

    <div class="campo">
      <label>Notas (opcional)</label>
      <textarea id="f-notas" rows="2"></textarea>
    </div>

    <div class="calc-preview" id="f-preview"></div>

    <button class="btn btn-primario btn-full" id="f-guardar" style="margin-top:14px">💾 Guardar préstamo</button>
  `, (body) => {
    let tipoPago = 'unico';

    const selectCliente = body.querySelector('#f-cliente');
    const boxNuevo = body.querySelector('#f-cliente-nuevo-box');
    selectCliente.addEventListener('change', () => {
      boxNuevo.style.display = selectCliente.value === '__nuevo__' ? 'block' : 'none';
    });

    body.querySelectorAll('.radio-opcion').forEach((op) => {
      op.onclick = () => {
        body.querySelectorAll('.radio-opcion').forEach((o) => o.classList.remove('selected'));
        op.classList.add('selected');
        tipoPago = op.dataset.tipo;
        body.querySelector('#f-cuotas-box').style.display = tipoPago === 'cuotas' ? 'block' : 'none';
        actualizarPreview();
      };
    });

    function actualizarPreview() {
      const capital = Number(body.querySelector('#f-capital').value) || 0;
      const tasa = Number(body.querySelector('#f-tasa').value) || 0;
      const nCuotas = tipoPago === 'cuotas' ? (Number(body.querySelector('#f-num-cuotas').value) || 1) : 1;
      const montoTotal = capital * (1 + tasa / 100);
      const ganancia = montoTotal - capital;
      const cuotaMonto = montoTotal / nCuotas;
      body.querySelector('#f-preview').innerHTML = `
        <div><span>Total a cobrar:</span><b>${moneda(montoTotal)}</b></div>
        <div><span>Ganancia:</span><b>${moneda(ganancia)}</b></div>
        ${tipoPago === 'cuotas' ? `<div><span>Cada cuota:</span><b>${moneda(cuotaMonto)}</b></div>` : ''}
      `;
    }
    body.querySelector('#f-capital').addEventListener('input', actualizarPreview);
    body.querySelector('#f-tasa').addEventListener('input', actualizarPreview);
    body.querySelector('#f-num-cuotas').addEventListener('input', actualizarPreview);
    actualizarPreview();

    body.querySelector('#f-guardar').onclick = async () => {
      try {
        let clienteId = selectCliente.value;
        if (!clienteId) { showToast('⚠️ Elegí un cliente'); return; }
        if (clienteId === '__nuevo__') {
          const nombre = body.querySelector('#f-nc-nombre').value.trim();
          if (!nombre) { showToast('⚠️ Falta el nombre del cliente nuevo'); return; }
          const nuevo = await api('POST', '/api/clientes', {
            nombre,
            dni: body.querySelector('#f-nc-dni').value.trim(),
            telefono: body.querySelector('#f-nc-telefono').value.trim(),
          });
          clienteId = nuevo.id;
        }
        const capital = Number(body.querySelector('#f-capital').value);
        if (!capital || capital <= 0) { showToast('⚠️ Falta el capital prestado'); return; }

        const payload = {
          cliente_id: clienteId,
          capital,
          tasa_interes: Number(body.querySelector('#f-tasa').value) || 0,
          tipo_pago: tipoPago,
          num_cuotas: Number(body.querySelector('#f-num-cuotas').value) || 1,
          frecuencia: body.querySelector('#f-frecuencia').value,
          fecha_inicio: body.querySelector('#f-fecha').value || hoyISO(),
          notas: body.querySelector('#f-notas').value.trim(),
        };
        await api('POST', '/api/prestamos', payload);
        closeModal();
        showToast('✅ Préstamo creado');
        state.view = 'prestamos';
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === 'prestamos'));
        await render();
      } catch (err) {
        showToast('⚠️ ' + err.message);
      }
    };
  });
}

// ---------- Vista: Solicitudes ----------

function badgeEstadoSolicitud(estado) {
  if (estado === 'aceptada') return '<span class="badge badge-pagada">Aceptada</span>';
  if (estado === 'rechazada') return '<span class="badge badge-vencida">Rechazada</span>';
  return '<span class="badge badge-hoy">Pendiente</span>';
}

async function renderSolicitudes(app) {
  const solicitudes = await api('GET', '/api/solicitudes');
  const linkPublico = window.location.origin + '/solicitud';
  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente');
  const historial = solicitudes.filter((s) => s.estado !== 'pendiente');

  app.innerHTML = `
    <div class="help-box">
      <b>📎 Compartí este link</b> con quien te pida un préstamo, para que cargue sus datos sin que vos tengas que responder nada:
      <div style="margin-top:8px;word-break:break-all;font-family:monospace;font-size:0.8rem">${escapeHtml(linkPublico)}</div>
      <div class="item-actions" style="margin-top:10px">
        <button class="btn btn-secundario" id="btn-copiar-link">📋 Copiar link</button>
        <button class="btn btn-whatsapp" id="btn-compartir-link">📲 Compartir por WhatsApp</button>
      </div>
    </div>

    <div class="section-title" style="margin-top:0">📥 Pendientes</div>
    <div id="lista-solicitudes-pendientes">${
      pendientes.length === 0
        ? `<div class="empty-state"><span class="emoji">📭</span>No hay solicitudes pendientes.</div>`
        : pendientes.map((s) => filaSolicitud(s)).join('')
    }</div>

    ${historial.length > 0 ? `
      <div class="section-title">Historial</div>
      <div>${historial.map((s) => filaSolicitud(s)).join('')}</div>
    ` : ''}
  `;

  document.getElementById('btn-copiar-link').onclick = async () => {
    try {
      await navigator.clipboard.writeText(linkPublico);
      showToast('✅ Link copiado');
    } catch (err) {
      showToast('⚠️ No se pudo copiar, copialo manualmente');
    }
  };
  document.getElementById('btn-compartir-link').onclick = () => {
    const mensaje = `Hola! Para pedir un préstamo, completá tus datos acá: ${linkPublico}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
  };

  app.querySelectorAll('[data-aceptar]').forEach((b) => {
    b.onclick = () => abrirAceptarSolicitud(solicitudes.find((s) => String(s.id) === b.dataset.aceptar));
  });
  app.querySelectorAll('[data-rechazar]').forEach((b) => {
    b.onclick = () => rechazarSolicitud(b.dataset.rechazar);
  });
  app.querySelectorAll('[data-avisar]').forEach((b) => {
    b.onclick = () => avisarSolicitudPorWhatsApp(b.dataset.avisar);
  });
}

function filaSolicitud(s) {
  const formaPago = s.tipo_pago_preferido === 'cuotas'
    ? `${s.num_cuotas_preferido || '?'} cuotas (${s.frecuencia_preferida || '-'})`
    : 'Pago único';
  return `
    <div class="item-card">
      <div class="item-card-top">
        <div>
          <div class="item-nombre">${escapeHtml(s.nombre)}</div>
          <div class="item-sub">📞 ${escapeHtml(s.telefono)}${s.dni ? ' · DNI ' + escapeHtml(s.dni) : ''}</div>
          <div class="item-sub">${formaPago}</div>
          ${s.referido_por ? `<div class="item-sub">Referido por: ${escapeHtml(s.referido_por)}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div class="item-monto">${s.monto_solicitado ? moneda(s.monto_solicitado) : '-'}</div>
          <div style="margin-top:6px">${badgeEstadoSolicitud(s.estado)}</div>
        </div>
      </div>
      ${s.mensaje ? `<div class="help-box" style="margin-top:10px">${escapeHtml(s.mensaje)}</div>` : ''}
      <div class="item-actions">
        ${s.estado === 'pendiente' ? `
          <button class="btn btn-exito" data-aceptar="${s.id}">✅ Aceptar</button>
          <button class="btn btn-peligro" data-rechazar="${s.id}">❌ Rechazar</button>
        ` : `
          <button class="btn btn-whatsapp" data-avisar="${s.id}">📲 Avisar por WhatsApp</button>
        `}
      </div>
    </div>
  `;
}

function rechazarSolicitud(id) {
  confirmarAccion('¿Rechazar esta solicitud de préstamo?', 'Sí, rechazar', async () => {
    try {
      await api('PUT', `/api/solicitudes/${id}/rechazar`, {});
      showToast('Solicitud rechazada');
      await render();
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  });
}

async function avisarSolicitudPorWhatsApp(id) {
  try {
    const r = await api('GET', `/api/solicitudes/${id}/whatsapp`);
    window.open(r.link, '_blank');
  } catch (err) {
    showToast('⚠️ ' + err.message);
  }
}

async function abrirAceptarSolicitud(s) {
  if (!s) return;
  const clientes = await api('GET', '/api/clientes');
  const opcionesClientes = clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  const tipoPreferido = s.tipo_pago_preferido === 'cuotas' ? 'cuotas' : 'unico';

  openModal(`Aceptar solicitud de ${s.nombre}`, `
    <div class="campo-ayuda" style="margin-bottom:10px">
      📞 ${escapeHtml(s.telefono)}${s.dni ? ' · DNI ' + escapeHtml(s.dni) : ''}${s.referido_por ? ' · Referido por ' + escapeHtml(s.referido_por) : ''}
    </div>
    <div class="campo">
      <label>Cliente</label>
      <select id="f-cliente">
        <option value="">➕ Crear cliente nuevo con estos datos</option>
        ${opcionesClientes}
      </select>
      <div class="campo-ayuda">Si esta persona ya está cargada como cliente, elegila acá para no duplicarla.</div>
    </div>

    <div class="fila-2">
      <div class="campo">
        <label>Capital a prestar *</label>
        <input type="number" id="f-capital" value="${s.monto_solicitado || ''}" min="0" step="0.01">
      </div>
      <div class="campo">
        <label>Interés (%) *</label>
        <input type="number" id="f-tasa" placeholder="Ej: 20" min="0" step="0.01">
      </div>
    </div>

    <div class="campo">
      <label>Forma de pago</label>
      <div class="radio-group">
        <div class="radio-opcion ${tipoPreferido === 'unico' ? 'selected' : ''}" data-tipo="unico">Pago único</div>
        <div class="radio-opcion ${tipoPreferido === 'cuotas' ? 'selected' : ''}" data-tipo="cuotas">En cuotas</div>
      </div>
    </div>

    <div id="f-cuotas-box" style="display:${tipoPreferido === 'cuotas' ? 'block' : 'none'}">
      <div class="fila-2">
        <div class="campo">
          <label>Cantidad de cuotas</label>
          <input type="number" id="f-num-cuotas" value="${s.num_cuotas_preferido || 4}" min="2" step="1">
        </div>
        <div class="campo">
          <label>Frecuencia</label>
          <select id="f-frecuencia">
            <option value="semanal" ${s.frecuencia_preferida === 'semanal' ? 'selected' : ''}>Semanal</option>
            <option value="quincenal" ${s.frecuencia_preferida === 'quincenal' ? 'selected' : ''}>Quincenal</option>
            <option value="mensual" ${(!s.frecuencia_preferida || s.frecuencia_preferida === 'mensual') ? 'selected' : ''}>Mensual</option>
          </select>
        </div>
      </div>
    </div>

    <div class="campo">
      <label>Fecha del préstamo</label>
      <input type="date" id="f-fecha" value="${hoyISO()}">
    </div>

    <div class="calc-preview" id="f-preview"></div>

    <button class="btn btn-exito btn-full" id="f-confirmar" style="margin-top:14px">✅ Confirmar y crear préstamo</button>
  `, (body) => {
    let tipoPago = tipoPreferido;

    body.querySelectorAll('.radio-opcion').forEach((op) => {
      op.onclick = () => {
        body.querySelectorAll('.radio-opcion').forEach((o) => o.classList.remove('selected'));
        op.classList.add('selected');
        tipoPago = op.dataset.tipo;
        body.querySelector('#f-cuotas-box').style.display = tipoPago === 'cuotas' ? 'block' : 'none';
        actualizarPreview();
      };
    });

    function actualizarPreview() {
      const capital = Number(body.querySelector('#f-capital').value) || 0;
      const tasa = Number(body.querySelector('#f-tasa').value) || 0;
      const nCuotas = tipoPago === 'cuotas' ? (Number(body.querySelector('#f-num-cuotas').value) || 1) : 1;
      const montoTotal = capital * (1 + tasa / 100);
      const ganancia = montoTotal - capital;
      const cuotaMonto = montoTotal / nCuotas;
      body.querySelector('#f-preview').innerHTML = `
        <div><span>Total a cobrar:</span><b>${moneda(montoTotal)}</b></div>
        <div><span>Ganancia:</span><b>${moneda(ganancia)}</b></div>
        ${tipoPago === 'cuotas' ? `<div><span>Cada cuota:</span><b>${moneda(cuotaMonto)}</b></div>` : ''}
      `;
    }
    body.querySelector('#f-capital').addEventListener('input', actualizarPreview);
    body.querySelector('#f-tasa').addEventListener('input', actualizarPreview);
    body.querySelector('#f-num-cuotas').addEventListener('input', actualizarPreview);
    actualizarPreview();

    body.querySelector('#f-confirmar').onclick = async () => {
      const capital = Number(body.querySelector('#f-capital').value);
      if (!capital || capital <= 0) { showToast('⚠️ Falta el capital'); return; }
      const tasa = body.querySelector('#f-tasa').value;
      if (tasa === '') { showToast('⚠️ Falta el interés'); return; }

      const clienteId = body.querySelector('#f-cliente').value || null;
      const payload = {
        cliente_id: clienteId,
        capital,
        tasa_interes: Number(tasa) || 0,
        tipo_pago: tipoPago,
        num_cuotas: Number(body.querySelector('#f-num-cuotas').value) || 1,
        frecuencia: body.querySelector('#f-frecuencia').value,
        fecha_inicio: body.querySelector('#f-fecha').value || hoyISO(),
      };
      try {
        await api('PUT', `/api/solicitudes/${s.id}/aceptar`, payload);
        closeModal();
        showToast('✅ Préstamo creado');
        await render();
        ofrecerAvisoWhatsApp(s.id);
      } catch (err) {
        showToast('⚠️ ' + err.message);
      }
    };
  });
}

function ofrecerAvisoWhatsApp(solicitudId) {
  openModal('¡Listo! 🎉', `
    <p style="margin-top:0">El préstamo ya está creado. ¿Querés avisarle por WhatsApp que fue aprobado?</p>
    <div class="item-actions">
      <button class="btn btn-secundario" id="btn-despues" style="flex:1">Más tarde</button>
      <button class="btn btn-whatsapp" id="btn-avisar-ya" style="flex:1">📲 Avisar ahora</button>
    </div>
  `, (body) => {
    body.querySelector('#btn-despues').onclick = closeModal;
    body.querySelector('#btn-avisar-ya').onclick = () => {
      closeModal();
      avisarSolicitudPorWhatsApp(solicitudId);
    };
  });
}

// ---------- Arranque ----------
render();
