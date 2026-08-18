-- ============================================================================
-- Migración 32: Doble Circuito Comercial
-- Circuito 1 (Lista 1) = ventas oficiales, facturables, impactan Libro de IVA.
-- Circuito 2 (Lista 2) = ventas internas, remitos no fiscales, EXCLUIDAS de
-- forma estricta (a nivel de base de datos, no solo de UI) de cualquier
-- comprobante fiscal y del Libro de IVA. Ambos circuitos ya comparten el
-- mismo stock físico (el descuento de stock no distingue lista) y ya tienen
-- listas de precio diferenciadas (listas_precio.lista, clientes.lista_1/2).
-- ============================================================================

-- Blindaje: un comprobante de Lista 2 (circuito interno) NUNCA puede ser un
-- tipo de comprobante fiscal (factura / nota_credito / nota_debito). Solo
-- puede ser remito o recibo (documentos de control interno, no fiscales).
alter table comprobantes drop constraint if exists chk_comprobante_circuito;
alter table comprobantes add constraint chk_comprobante_circuito
  check (lista <> 2 or tipo in ('remito', 'recibo'));

-- Índice para acelerar el filtrado del Libro de IVA (solo Circuito 1) y los
-- reportes consolidados (ambos circuitos).
create index if not exists idx_comprobantes_tenant_lista_fecha on comprobantes(tenant_id, lista, fecha);
create index if not exists idx_pedidos_tenant_lista_fecha on pedidos(tenant_id, lista, fecha);
