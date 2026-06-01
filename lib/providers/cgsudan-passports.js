import { chromium } from "playwright";

const PAGE_URL = "https://cgsudan-dubai.ae/passports/";
const DEFAULT_UNAVAILABLE_MESSAGE =
  "الرقم المدخل لا يطابق أي من الجوازات الموجوده بالقنصلية (الجواز لم يصل القنصلية بعد)";
const AVAILABLE_MESSAGE_SNIPPET = "جوازكم الآن طرف القنصلية العامة";

export const cgsudanPassportsProvider = {
  id: "cgsudan-passports",
  name: "CGSudan Passports",
  description: "Checks the Sudan consulate passport-arrival page in Dubai.",
  async check(config) {
    const nationalId = String(config.nationalId ?? "").trim();

    if (!/^\d+$/u.test(nationalId)) {
      throw new Error("CGSudan provider needs a numeric national ID.");
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(PAGE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });

      await page.locator("#field_pk3s8").fill(nationalId);
      await page.locator("#field_pk3s8").press("Tab");

      const snapshots = [];
      const startedAt = Date.now();
      let finalValues = null;

      while (Date.now() - startedAt < 12000) {
        const values = await page.evaluate(() => {
          const read = (selector) => document.querySelector(selector)?.value?.trim() ?? "";
          return {
            passportRef: read("#field_z1ye7"),
            name: read("#field_iizo9"),
            availableMessage: read("#field_gfau3"),
            unavailableMessage: read("#field_lzmoc"),
            arrivalDate: read("#field_eevod")
          };
        });

        snapshots.push({
          at: new Date().toISOString(),
          ...values
        });

        if (values.availableMessage.includes(AVAILABLE_MESSAGE_SNIPPET) || values.passportRef) {
          finalValues = values;
          break;
        }

        if (values.unavailableMessage.includes(DEFAULT_UNAVAILABLE_MESSAGE)) {
          finalValues = values;
        }

        await page.waitForTimeout(350);
      }

      if (!finalValues) {
        finalValues = snapshots.at(-1) ?? {
          passportRef: "",
          name: "",
          availableMessage: "",
          unavailableMessage: "",
          arrivalDate: ""
        };
      }

      if (finalValues.availableMessage.includes(AVAILABLE_MESSAGE_SNIPPET) || finalValues.passportRef) {
        await page.waitForTimeout(1200);
        const enrichedValues = await page.evaluate(() => {
          const read = (selector) => document.querySelector(selector)?.value?.trim() ?? "";
          return {
            passportRef: read("#field_z1ye7"),
            name: read("#field_iizo9"),
            availableMessage: read("#field_gfau3"),
            unavailableMessage: read("#field_lzmoc"),
            arrivalDate: read("#field_eevod")
          };
        });

        snapshots.push({
          at: new Date().toISOString(),
          ...enrichedValues
        });

        finalValues = enrichedValues;
      }

      if (
        finalValues.unavailableMessage.includes(DEFAULT_UNAVAILABLE_MESSAGE) &&
        !finalValues.availableMessage &&
        !finalValues.passportRef
      ) {
        await page.waitForTimeout(2500);
        const settledValues = await page.evaluate(() => {
          const read = (selector) => document.querySelector(selector)?.value?.trim() ?? "";
          return {
            passportRef: read("#field_z1ye7"),
            name: read("#field_iizo9"),
            availableMessage: read("#field_gfau3"),
            unavailableMessage: read("#field_lzmoc"),
            arrivalDate: read("#field_eevod")
          };
        });

        snapshots.push({
          at: new Date().toISOString(),
          ...settledValues
        });

        if (settledValues.availableMessage.includes(AVAILABLE_MESSAGE_SNIPPET) || settledValues.passportRef) {
          finalValues = settledValues;
        } else {
          finalValues = settledValues;
        }
      }

      let result;
      if (finalValues.availableMessage.includes(AVAILABLE_MESSAGE_SNIPPET) || finalValues.passportRef) {
        result = {
          status: "available",
          message: finalValues.availableMessage,
          details: {
            name: finalValues.name,
            arrivalDate: finalValues.arrivalDate,
            passportRef: finalValues.passportRef
          }
        };
      } else if (finalValues.unavailableMessage.includes(DEFAULT_UNAVAILABLE_MESSAGE)) {
        result = {
          status: "not_available",
          message: finalValues.unavailableMessage,
          details: {
            name: finalValues.name,
            arrivalDate: finalValues.arrivalDate,
            passportRef: finalValues.passportRef
          }
        };
      } else {
        result = {
          status: "unknown",
          message:
            finalValues.unavailableMessage ||
            finalValues.availableMessage ||
            "The page returned an unclear status.",
          details: {
            name: finalValues.name,
            arrivalDate: finalValues.arrivalDate,
            passportRef: finalValues.passportRef
          }
        };
      }

      return {
        ...result,
        checkedAt: new Date().toISOString(),
        trace: snapshots.slice(-8)
      };
    } finally {
      await browser.close();
    }
  }
};
