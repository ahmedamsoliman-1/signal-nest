const PAGE_URL = "https://cgsudan-dubai.ae/passports/";
const AJAX_URL = "https://cgsudan-dubai.ae/wp-admin/admin-ajax.php";
const DEFAULT_UNAVAILABLE_MESSAGE =
  "الرقم المدخل لا يطابق أي من الجوازات الموجوده بالقنصلية (الجواز لم يصل القنصلية بعد)";
const AVAILABLE_MESSAGE =
  "جوازكم الآن طرف القنصلية العامة\nيتم التسليم فقط عبر خدمة التوصيل\nلطلب توصيل يرجى الضغط على زر طلب التوصيل باسفل الصفحة";

function extractNonce(html) {
  const match = html.match(/"nonce":"([^"]+)"/u);
  if (!match) {
    throw new Error("Unable to extract CGSudan lookup nonce.");
  }
  return match[1];
}

async function fetchLookupField({ nationalId, fieldId, nonce }) {
  const body = new URLSearchParams({
    action: "frm_get_lookup_text_value",
    "parent_fields[]": "44",
    "parent_vals[]": nationalId,
    field_id: String(fieldId),
    nonce
  });

  const response = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`CGSudan lookup failed for field ${fieldId} with HTTP ${response.status}.`);
  }

  return response.text();
}

export const cgsudanPassportsProvider = {
  id: "cgsudan-passports",
  name: "CGSudan Passports",
  description: "Checks the Sudan consulate passport-arrival page in Dubai.",
  async check(config) {
    const nationalId = String(config.nationalId ?? "").trim();

    if (!/^\d+$/u.test(nationalId)) {
      throw new Error("CGSudan provider needs a numeric national ID.");
    }

    const pageResponse = await fetch(PAGE_URL, { cache: "no-store" });
    if (!pageResponse.ok) {
      throw new Error(`Failed to load CGSudan page with HTTP ${pageResponse.status}.`);
    }

    const html = await pageResponse.text();
    const nonce = extractNonce(html);

    const [passportRef, name, arrivalDate] = await Promise.all([
      fetchLookupField({ nationalId, fieldId: 46, nonce }),
      fetchLookupField({ nationalId, fieldId: 47, nonce }),
      fetchLookupField({ nationalId, fieldId: 619, nonce })
    ]);

    const details = {
      name: name.trim(),
      arrivalDate: arrivalDate.trim(),
      passportRef: passportRef.trim()
    };

    const trace = [
      {
        at: new Date().toISOString(),
        nonce,
        passportRef: details.passportRef,
        name: details.name,
        arrivalDate: details.arrivalDate
      }
    ];

    if (details.passportRef) {
      return {
        status: "available",
        message: AVAILABLE_MESSAGE,
        details,
        checkedAt: new Date().toISOString(),
        trace
      };
    }

    return {
      status: "not_available",
      message: DEFAULT_UNAVAILABLE_MESSAGE,
      details,
      checkedAt: new Date().toISOString(),
      trace
    };
  }
};
