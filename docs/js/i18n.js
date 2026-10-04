/* Haven Hub — the words on the pages participants and applicants see (the public page and the Apply page), in each language a hub offers.
   The dashboard itself is English. A hub picks its languages in Settings → Public page (the first one is the default).
   Add a language: copy the `en` block below, translate every value, add its code to LANGS in apps-script/Code.gs, and open a pull request.
   ⚠️ The Uzbek and Russian texts were written for Haven Tashkent and still need a native speaker's check — corrections are welcome. */
import { store, esc } from './ui.js';

export const NAMES = { en: 'English', uz: 'Oʻzbekcha', ru: 'Русский' };

const T = {
  en: {
    language: 'Language',
    signup: 'Sign up to take part', organizers: 'Organizers',
    supported: 'Supported by', supportedSub: 'thank you for making {event} possible',
    ready: 'Getting ready', readySub: 'the organizing team\'s checklist', tasksDone: '{done} of {total} tasks done',
    signups: 'Signed up so far', signupsSub: 'on HQ\'s signup page', ofGoal: 'of {goal}',
    whatIs: 'What is Haven?', whatIsText: 'Haven is a {hc} programme: teen-run game jams in cities around the world, on the same weekend. You build a video game in two days and ship it for everyone to play.',
    whatIsAges: 'For ages 13–18. No experience needed.',
    joinTitle: 'Join the organizing team', joinBtn: 'Apply to join',
    organizer: 'Organizer?', organizerText: 'Sign in, or open the invite your lead sent you.', organizerBtn: 'Organizer sign-in',
    days: 'days', hours: 'hours', minutes: 'minutes', live: 'Live', liveSub: 'happening now',
    applyTitle: 'Join the {event} team', applyLede: 'We need help with design, social media, schools, tech and the event weekend. No experience needed.',
    google: 'Sign up with Google', googleHint: 'fills in your name and email — or type them below', googleOk: 'Google confirmed it\'s you: {name}. Fill in the rest and press Send.', notYou: 'Not you?',
    name: 'Your name', contact: 'Telegram @username or email', contactOpt: 'Telegram @username (optional)',
    age: 'Your age', age1318: '13–18', age19: '19 or older', age19hint: 'Hack Club rule: people 19+ can\'t organize or take part — but you can help as a mentor or volunteer. Send it anyway!',
    school: 'Your school (optional)', schoolPh: 'e.g. School No. 110',
    interests: 'What would you like to help with? (pick any)',
    i_design: 'Design & posters', i_social: 'Social media & video', i_outreach: 'Schools & outreach', i_sponsors: 'Sponsors & partners', i_tech: 'Tech & website', i_event: 'Event weekend help', i_mentor: 'Mentoring (19+)', i_other: 'Something else',
    free: 'When are you free? (optional)', f_weekdays: 'Weekday evenings', f_weekends: 'Weekends', f_event: 'The event weekend',
    note: 'Anything else? (optional)', notePh: 'Skills, things you have made, questions…',
    privacy: 'We only use this to contact you about helping. It goes to the organizers — nowhere else.',
    send: 'Send', sending: 'Sending…', chooseAge: 'Choose your age group.', chooseOne: 'Pick at least one thing you would like to help with.',
    thanks: 'Thank you!', thanksText: 'An organizer will message you soon.', dup: 'We already have your application. An organizer will message you.', thanksChannel: 'Meanwhile, follow our Telegram channel',
    thanksGoogle: 'Once you are on the team, “Sign in with Google” takes you straight to your tasks.',
    back: '← Back to the event page', closed: 'The team is not taking applications right now.',
  },
  uz: {
    language: 'Til',
    signup: 'Ishtirokchi sifatida roʻyxatdan oʻt', organizers: 'Tashkilotchilar',
    supported: 'Homiylarimiz', supportedSub: '{event}ni oʻtkazishga yordam berganingiz uchun rahmat',
    ready: 'Tayyorgarlik', readySub: 'tashkilotchilar jamoasining vazifalari', tasksDone: '{total} ta vazifadan {done} tasi bajarildi',
    signups: 'Roʻyxatdan oʻtganlar', signupsSub: 'HQ roʻyxat sahifasida', ofGoal: 'maqsad: {goal}',
    whatIs: 'Haven nima?', whatIsText: 'Haven — {hc} dasturi: dunyoning turli shaharlarida bir xil dam olish kunlarida oʻsmirlar oʻzlari tashkil qiladigan geymjemlar. Ikki kunda oʻz video oʻyiningni yaratasan va hamma oʻynay olishi uchun internetga joylaysan.',
    whatIsAges: '13–18 yoshdagilar uchun. Tajriba shart emas.',
    joinTitle: 'Tashkilotchilar jamoasiga qoʻshil', joinBtn: 'Ariza topshirish',
    organizer: 'Tashkilotchimisan?', organizerText: 'Tizimga kir yoki senga yuborilgan taklif havolasini och.', organizerBtn: 'Tashkilotchilar uchun kirish',
    days: 'kun', hours: 'soat', minutes: 'daqiqa', live: 'Boshlandi', liveSub: 'hozir boʻlyapti',
    applyTitle: '{event} jamoasiga qoʻshil', applyLede: 'Bizga dizayn, ijtimoiy tarmoqlar, maktablar bilan ishlash, texnika va tadbir kunlarida yordam kerak. Tajriba shart emas.',
    google: 'Google orqali roʻyxatdan oʻtish', googleHint: 'isming va emailingni oʻzi toʻldiradi — yoki pastda oʻzing yoz', googleOk: 'Google bu sen ekaningni tasdiqladi: {name}. Qolganini toʻldirib, «Yuborish»ni bos.', notYou: 'Bu sen emasmisan?',
    name: 'Isming', contact: 'Telegram @username yoki email', contactOpt: 'Telegram @username (ixtiyoriy)',
    age: 'Yoshing', age1318: '13–18', age19: '19 va undan katta', age19hint: 'Hack Club qoidasi: 19 yosh va undan kattalar tashkilotchi yoki ishtirokchi boʻla olmaydi — lekin mentor yoki koʻngilli sifatida yordam bera olasan. Baribir yubor!',
    school: 'Maktabing (ixtiyoriy)', schoolPh: 'masalan, 110-maktab',
    interests: 'Nimada yordam bermoqchisan? (bir nechtasini tanlasa boʻladi)',
    i_design: 'Dizayn va afishalar', i_social: 'Ijtimoiy tarmoqlar va video', i_outreach: 'Maktablar bilan ishlash', i_sponsors: 'Homiylar va hamkorlar', i_tech: 'Texnika va veb-sayt', i_event: 'Tadbir kunlarida yordam', i_mentor: 'Mentorlik (19+)', i_other: 'Boshqa narsa',
    free: 'Qachon boʻsh boʻlasan? (ixtiyoriy)', f_weekdays: 'Ish kunlari kechqurun', f_weekends: 'Dam olish kunlari', f_event: 'Tadbir boʻladigan dam olish kunlari',
    note: 'Yana nimadir? (ixtiyoriy)', notePh: 'Koʻnikmalaring, ilgari nima qilgansan, savollaring…',
    privacy: 'Bu maʼlumotlar faqat sen bilan yordam haqida bogʻlanish uchun kerak. Ularni faqat tashkilotchilar koʻradi.',
    send: 'Yuborish', sending: 'Yuborilmoqda…', chooseAge: 'Yoshingni tanla.', chooseOne: 'Yordam bermoqchi boʻlgan kamida bitta yoʻnalishni tanla.',
    thanks: 'Rahmat!', thanksText: 'Tez orada tashkilotchilardan biri senga yozadi.', dup: 'Arizang bizda bor. Tashkilotchilardan biri senga yozadi.', thanksChannel: 'Hozircha Telegram kanalimizga obuna boʻl',
    thanksGoogle: 'Jamoaga qoʻshilganingdan keyin «Google orqali kirish» seni toʻgʻridan-toʻgʻri vazifalaringga olib boradi.',
    back: '← Tadbir sahifasiga qaytish', closed: 'Hozir jamoaga ariza qabul qilinmayapti.',
  },
  ru: {
    language: 'Язык',
    signup: 'Зарегистрироваться как участник', organizers: 'Организаторам',
    supported: 'При поддержке', supportedSub: 'спасибо, что помогаете провести {event}',
    ready: 'Подготовка', readySub: 'задачи команды организаторов', tasksDone: 'выполнено {done} из {total} задач',
    signups: 'Уже зарегистрировались', signupsSub: 'на странице регистрации HQ', ofGoal: 'цель: {goal}',
    whatIs: 'Что такое Haven?', whatIsText: 'Haven — программа {hc}: геймджемы, которые проводят сами подростки в городах по всему миру в одни и те же выходные. За два дня ты создаёшь свою видеоигру и публикуешь её, чтобы в неё могли сыграть все.',
    whatIsAges: 'Для ребят 13–18 лет. Опыт не нужен.',
    joinTitle: 'Присоединяйся к команде организаторов', joinBtn: 'Подать заявку',
    organizer: 'Ты организатор?', organizerText: 'Войди или открой приглашение, которое тебе прислали.', organizerBtn: 'Вход для организаторов',
    days: 'дн.', hours: 'ч', minutes: 'мин', live: 'Уже идёт', liveSub: 'прямо сейчас',
    applyTitle: 'Присоединяйся к команде {event}', applyLede: 'Нам нужна помощь с дизайном, соцсетями, работой со школами, техникой и в дни мероприятия. Опыт не нужен.',
    google: 'Зарегистрироваться через Google', googleHint: 'заполнит имя и email — или введи их ниже', googleOk: 'Google подтвердил, что это ты: {name}. Заполни остальное и нажми «Отправить».', notYou: 'Это не ты?',
    name: 'Твоё имя', contact: 'Telegram @username или email', contactOpt: 'Telegram @username (необязательно)',
    age: 'Твой возраст', age1318: '13–18', age19: '19 и старше', age19hint: 'Правило Hack Club: люди 19+ не могут быть организаторами или участниками — но ты можешь помочь как ментор или волонтёр. Всё равно отправляй!',
    school: 'Твоя школа (необязательно)', schoolPh: 'например, школа № 110',
    interests: 'С чем ты хочешь помочь? (можно выбрать несколько)',
    i_design: 'Дизайн и афиши', i_social: 'Соцсети и видео', i_outreach: 'Работа со школами', i_sponsors: 'Спонсоры и партнёры', i_tech: 'Техника и сайт', i_event: 'Помощь в дни мероприятия', i_mentor: 'Менторство (19+)', i_other: 'Что-то другое',
    free: 'Когда у тебя есть время? (необязательно)', f_weekdays: 'Будни вечером', f_weekends: 'Выходные', f_event: 'Выходные мероприятия',
    note: 'Что-то ещё? (необязательно)', notePh: 'Навыки, что ты уже делал(а), вопросы…',
    privacy: 'Мы используем это только чтобы связаться с тобой насчёт помощи. Это видят только организаторы.',
    send: 'Отправить', sending: 'Отправляем…', chooseAge: 'Выбери свой возраст.', chooseOne: 'Выбери хотя бы одно направление, где хочешь помочь.',
    thanks: 'Спасибо!', thanksText: 'Скоро тебе напишет кто-то из организаторов.', dup: 'Твоя заявка у нас уже есть. Кто-то из организаторов тебе напишет.', thanksChannel: 'А пока подпишись на наш Telegram-канал',
    thanksGoogle: 'Когда ты будешь в команде, кнопка «Войти через Google» сразу откроет твои задачи.',
    back: '← Назад на страницу мероприятия', closed: 'Сейчас мы не принимаем заявки в команду.',
  },
};

/** What the Apply form stores: the English label (Dashboard → Applications and the areas use it), whatever language the form was in. */
export const INTERESTS = ['design', 'social', 'outreach', 'sponsors', 'tech', 'event', 'mentor', 'other'];
export const FREE = ['weekdays', 'weekends', 'event'];
export const stored = (kind, k) => T.en[kind + k];

/** The languages a hub offers (from its public info), known ones only; English when it says nothing. */
export const langsOf = P => { const l = ((P && P.langs) || []).filter(x => T[x]); return l.length ? l : ['en']; };
/** ?lang= in the address, then this browser's last choice, then the hub's first language. */
export function pickLang(avail) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '').get('lang') || new URLSearchParams(location.search).get('lang');
  if (q && avail.includes(q)) { store.set('hh:lang', q); return q; }
  const s = store.get('hh:lang');
  return s && avail.includes(s) ? s : avail[0];
}
export const setLang = l => store.set('hh:lang', l);
/** t(lang)('key', { vars }) — falls back to English for anything a language doesn't have yet. */
export const tr = lang => (key, vars) => String((T[lang] || T.en)[key] ?? T.en[key] ?? key).replace(/\{(\w+)\}/g, (_, v) => vars && vars[v] != null ? vars[v] : '');
/** A setting the hub has per language ({ en, uz, … }) → the one for this language, else English. */
export const textIn = (map, lang, fallback) => (map && (map[lang] || map.en)) || fallback || '';
/** Small language switcher (only when the hub offers more than one). */
export const langSwitch = (avail, lang) => avail.length < 2 ? '' :
  `<div class="lang-sw" role="group" aria-label="${esc(tr(lang)('language'))}">${avail.map(l => `<button type="button" data-lang="${l}" class="${l === lang ? 'on' : ''}" aria-pressed="${l === lang}" lang="${l}">${esc(NAMES[l] || l)}</button>`).join('')}</div>`;
