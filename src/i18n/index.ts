export type Lang = "ru" | "uk";

const ru = {
  chooseLang: "Выберите язык / Оберіть мову",
  welcome:
    "Привет! Я помогаю иностранцам с JDG в Польше понять, сколько и когда платить ZUS и налог.\n\n" +
    "Сейчас идёт подготовка к закрытой бете. Ответьте на пару вопросов — это займёт минуту.",
  askTaxForm: "Какая у вас форма налогообложения?",
  taxForms: { ryczalt: "Ryczałt", liniowy: "Линейный 19%", skala: "Шкала", unknown: "Не знаю" },
  askVat: "Вы плательщик VAT?",
  yes: "Да",
  no: "Нет",
  dontKnow: "Не знаю",
  askZus: "Какой у вас ZUS сейчас?",
  zusSchemes: {
    ulga_na_start: "Ulga na start (только здоровье)",
    preferencyjny: "Preferencyjny (маленький)",
    pelny: "Полный",
    unknown: "Не знаю",
  },
  done:
    "Спасибо! Записал вас в лист ожидания. Напишу сюда, когда откроется бета.\n" +
    "Важно: это инструмент для самостоятельного расчёта, а не налоговая консультация.\n" +
    "Удалить свои данные можно командой /delete.",
  deleted: "Готово, все ваши данные удалены.",
  schemeName: {
    ulga_na_start: "ulga na start",
    preferencyjny: "preferencyjny ZUS",
    pelny: "полный ZUS",
  },
  askZusSince: (scheme: string) =>
    `С какой даты у вас ${scheme}? Напишите дату, например 15.03.2026.\n` +
    "Обычно это дата открытия JDG (для ulga na start) или первый день после её окончания (для preferencyjny).",
  badDate: "Не понял дату. Напишите в формате ДД.ММ.ГГГГ, например 15.03.2026.",
  futureDate: "Эта дата слишком далеко в будущем. Проверьте, пожалуйста.",
  schemeEnded: (scheme: string, end: string) =>
    `По моим расчётам ${scheme} закончилась ${end}. Выберите, какой ZUS у вас сейчас:`,
  zusSchedule: (scheme: string, end: string, next: string, nextStart: string) =>
    `Записал. ${scheme} действует примерно до ${end}, с ${nextStart} — ${next}. ` +
    "Заранее напомню о переходе. Точную дату сверьте в PUE/eZUS.",
};

const uk: typeof ru = {
  chooseLang: "Выберите язык / Оберіть мову",
  welcome:
    "Привіт! Я допомагаю іноземцям з JDG у Польщі зрозуміти, скільки і коли платити ZUS і податок.\n\n" +
    "Зараз триває підготовка до закритої бети. Дайте відповідь на кілька питань — це займе хвилину.",
  askTaxForm: "Яка у вас форма оподаткування?",
  taxForms: { ryczalt: "Ryczałt", liniowy: "Лінійний 19%", skala: "Шкала", unknown: "Не знаю" },
  askVat: "Ви платник VAT?",
  yes: "Так",
  no: "Ні",
  dontKnow: "Не знаю",
  askZus: "Який у вас ZUS зараз?",
  zusSchemes: {
    ulga_na_start: "Ulga na start (лише здоров'я)",
    preferencyjny: "Preferencyjny (малий)",
    pelny: "Повний",
    unknown: "Не знаю",
  },
  done:
    "Дякую! Записав вас до листа очікування. Напишу сюди, коли відкриється бета.\n" +
    "Важливо: це інструмент для самостійного розрахунку, а не податкова консультація.\n" +
    "Видалити свої дані можна командою /delete.",
  deleted: "Готово, всі ваші дані видалено.",
  schemeName: {
    ulga_na_start: "ulga na start",
    preferencyjny: "preferencyjny ZUS",
    pelny: "повний ZUS",
  },
  askZusSince: (scheme: string) =>
    `З якої дати у вас ${scheme}? Напишіть дату, наприклад 15.03.2026.\n` +
    "Зазвичай це дата відкриття JDG (для ulga na start) або перший день після її закінчення (для preferencyjny).",
  badDate: "Не зрозумів дату. Напишіть у форматі ДД.ММ.РРРР, наприклад 15.03.2026.",
  futureDate: "Ця дата надто далеко в майбутньому. Перевірте, будь ласка.",
  schemeEnded: (scheme: string, end: string) =>
    `За моїми розрахунками ${scheme} закінчилась ${end}. Оберіть, який ZUS у вас зараз:`,
  zusSchedule: (scheme: string, end: string, next: string, nextStart: string) =>
    `Записав. ${scheme} діє приблизно до ${end}, з ${nextStart} — ${next}. ` +
    "Заздалегідь нагадаю про перехід. Точну дату звірте в PUE/eZUS.",
};

export const texts: Record<Lang, typeof ru> = { ru, uk };
