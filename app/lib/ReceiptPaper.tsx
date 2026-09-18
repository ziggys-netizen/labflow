import { formatPaymentAmount, PAYMENT_METHOD_LABELS, type OrderPayment } from "./orderPayment";

/**
 * What a cashier's receipt says. One receipt covers one transaction — an
 * order's tests, or one service charge — never several combined.
 *
 * The transaction ID is shown: it is the patient's own proof of a transfer,
 * not a secret. The staff member who took payment is not named — role only
 * (rule 10 and the norm for anything that leaves the building in a patient's
 * hand, stricter than an internal-only screen).
 */
export interface ReceiptData {
  clinicName: string;
  patientLabId: string;
  patientName: string;
  issuedAt: string;
  lineItems: string[];
  payment: OrderPayment;
  issuedByRole: string;
}

export const RECEIPT_PAGE_CSS = "@page { size: A4; margin: 15mm; }";

export default function ReceiptPaper({ data }: { data: ReceiptData }) {
  return (
    <div className="mx-auto max-w-[110mm] border border-gray-300 p-6 print:border-0 print:p-0">
      <p className="text-center text-lg font-semibold text-gray-900">{data.clinicName}</p>
      <p className="text-center text-sm text-gray-600 mb-4">Payment receipt</p>

      <div className="border-t border-b border-gray-300 py-3 mb-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">Lab ID</p>
        <p className="lf-num text-xl font-bold text-gray-900">{data.patientLabId}</p>
      </div>

      <div className="text-sm text-gray-700 mb-4 space-y-0.5">
        <p>{data.patientName}</p>
        <p className="text-gray-500">{new Date(data.issuedAt).toLocaleString()}</p>
      </div>

      <table className="w-full text-sm mb-4">
        <tbody>
          {data.lineItems.map((label, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-1 text-gray-900">{label}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-gray-300 pt-3 space-y-1 text-sm">
        <div className="flex items-center justify-between font-semibold text-gray-900">
          <span>Total paid</span>
          <span className="lf-num">{formatPaymentAmount(data.payment)}</span>
        </div>
        <div className="flex items-center justify-between text-gray-600">
          <span>Method</span>
          <span>{PAYMENT_METHOD_LABELS[data.payment.method]}</span>
        </div>
        {data.payment.reference && (
          <div className="flex items-center justify-between text-gray-600">
            <span>Transaction ID</span>
            <span className="lf-num">{data.payment.reference}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-6 text-center">
        Issued by {data.issuedByRole} · Keep this receipt. The lab uses the Lab ID above to find your
        record.
      </p>
    </div>
  );
}
