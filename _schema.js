// Shared extraction prompt + JSON schema (files starting with _ are not routes on Vercel).
const money = {
  type: 'object',
  properties: {
    amount: { type: ['number', 'null'], description: 'Plain number in the invoice currency, no symbols. null if not found.' },
    source: { type: 'string', description: 'Document the value came from, e.g. "CBP 7501", "Freight Invoice INV25000418".' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    note: { type: 'string', description: 'How it was derived, or what was combined into it.' },
  },
  required: ['amount', 'confidence'],
};

export const TOOL = {
  name: 'record_po',
  description: 'Record the landed-cost data extracted from a purchase order and its shipping/customs documents.',
  input_schema: {
    type: 'object',
    properties: {
      retailer: { type: 'string', description: 'Wholesale customer the goods are for (e.g. Macy\'s).' },
      season: { type: 'string' },
      currency: { type: 'string', description: 'ISO currency code of the amounts, e.g. USD.' },
      freight_mode: { type: 'string', enum: ['air', 'ocean', 'truck', 'rail', 'unknown'] },
      route: { type: 'string', description: 'e.g. HKG → ORD → STL' },
      ship_window: { type: 'string', description: 'e.g. Feb 12 – Feb 18, 2025' },
      costs: {
        type: 'object',
        properties: {
          factory: money, freight: money, duty: money, mpf: money, clearance: money,
          handling: money, terminal: money, decon: money, delivery: money,
        },
        required: ['factory', 'freight', 'duty', 'mpf', 'clearance', 'handling', 'terminal', 'decon', 'delivery'],
      },
      units: { type: ['integer', 'null'], description: 'Total pairs/units in the shipment.' },
      skus: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            style: { type: 'string' }, color: { type: 'string', description: 'Color / material' },
            qty: { type: 'integer' }, unit_price: { type: 'number', description: 'Factory price per unit' },
          },
          required: ['style', 'qty', 'unit_price'],
        },
      },
      documents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file_name: { type: 'string' }, doc_type: { type: 'string' }, issuer: { type: 'string' },
            reference: { type: 'string' }, date: { type: 'string' }, total: { type: ['number', 'null'] },
            key_fields: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } },
          },
          required: ['file_name', 'doc_type'],
        },
      },
      timeline: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, date: { type: 'string' } }, required: ['label', 'date'] } },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['costs', 'skus', 'documents', 'warnings'],
  },
};

export const SYSTEM = `You extract landed-cost data from import documents for footwear and apparel brands that sell wholesale to retailers. Documents may include commercial invoices, packing lists, air waybills, bills of lading, arrival notices, customs bonds, CBP 7501 entry summaries and freight/logistics invoices.

Map every cost to exactly one field:
- factory: total factory/commercial invoice value (EXW/FOB) for the goods.
- freight: main air/ocean/truck freight charge.
- duty: total customs duties, including Section 301 and AD/CVD. Exclude MPF and HMF.
- mpf: Merchandise Processing Fee, plus Harbor Maintenance Fee if present (say so in note).
- clearance: customs brokerage / clearance / entry filing fees.
- handling: handling, documentation and other forwarder service fees.
- terminal: airline terminal, port, CFS or pier fees.
- decon: deconsolidation, transfer or container drayage.
- delivery: final delivery to the warehouse or 3PL.

Rules:
- A cost that appears on several documents (e.g. duty on the 7501 and re-billed on the freight invoice) is counted once. Prefer the primary source (CBP 7501 for duty).
- Never invent numbers. Use null when a value is not in the documents and add a warning.
- Use confidence "low" for anything inferred, summed from partial lines, or hard to read.
- SKUs come from the commercial invoice or packing list: one row per style + color with quantity and factory unit price.
- If the amounts are not in USD, say so in warnings.
- Add a warning for anything the user should double-check (e.g. SKU totals not matching the invoice total).`;

export function userPrompt(retailer, season) {
  return `Extract the landed-cost data from the documents above.${retailer ? ` The user says this PO is for: ${retailer}.` : ''}${season ? ` Season: ${season}.` : ''}`;
}
