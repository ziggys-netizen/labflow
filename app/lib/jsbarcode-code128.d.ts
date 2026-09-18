/**
 * JsBarcode ships no types for its individual encoders. The barcode round-trip
 * test reaches for the Code 128 encoder directly so it can check the exact bar
 * pattern the specimen label prints.
 */
declare module "jsbarcode/bin/barcodes/CODE128/CODE128_AUTO.js" {
  export default class CODE128AUTO {
    constructor(data: string, options: Record<string, unknown>);
    /** `data` is the bar pattern: "1" is a bar, "0" a space. */
    encode(): { data: string; text: string };
  }
}
