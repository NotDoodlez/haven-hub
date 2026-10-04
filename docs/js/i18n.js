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

/** The referral page (#/r/CODE), the ambassador's own page (#/amb) and their poster. Ambassadors and their friends are students: plain, friendly words. */
const AMB = {
  en: {
    i_ambassador: 'School ambassador (bring my school)',
    refBy: '{name} invited you!', refLede: 'Make your own video game in two days. Free, for ages 13–18, no experience needed.',
    refName: 'Your first name', refAge: 'I am 13–18 years old', refAgeNo: 'Haven is for ages 13–18. Older? You can help as a mentor or volunteer.',
    refGo: 'Next: sign up', refSkip: 'Skip — go straight to the signup page', nameShort: 'Write your first name.',
    refPrivacy: 'We save only your first name and this code, so we know who invited you. We delete them on {date}.',
    refNext: 'Last step: the official signup on Hack Club\'s page (1 minute).', refOpen: 'Open the signup page', refGoing: 'Taking you to the signup page…',
    refNoSignup: 'Signups are not open yet. Check our channel for news.',
    ambHi: 'Hi, {name}!', ambLede: 'You are a {event} ambassador. Your job is simple: get friends from your school to sign up with your link.',
    ambLink: 'Your link', ambCode: 'Code', ambCopy: 'Copy', ambCopied: 'Copied!', ambShare: 'Share in Telegram',
    ambQr: 'Your QR code', ambQrSub: 'Friends scan it with their phone camera.', ambPoster: 'A4 poster with your QR code', ambSaveQr: 'Save the QR code',
    ambNumbers: 'Your numbers', ambSigned: 'signed up with your link', ambCame: 'came to the event', ambWeek: '{n} this week',
    ambOff: 'Friends go straight to the official signup page for now. Your numbers show here once counting starts.',
    ambRewards: 'Rewards', ambRewardsSub: 'given at the event, when your friends come',
    ambTop: 'Top 5 ambassadors', ambTopNames: 'by friends who signed up', ambTopCame: 'by friends who came', ambTopNone: 'Nobody yet — be the first!', ambYou: 'you',
    ambHow: 'How to do it', ambHow1: 'Send the message below to your class Telegram group.', ambHow2: 'Print the poster and put it up at school — ask a teacher first.',
    ambHow3: 'Post a story with your link or QR code.', ambHow4: 'Tell 5 friends in person. This works best.',
    ambMsg: 'Message for your class group', ambGroup: 'Ambassadors\' group', ambGroupBtn: 'Open the group', ambBuddy: 'Questions? Write to {name}',
    ambGone: 'This link does not work any more. Ask the organizer who gave it to you for a new one.', ambPaused: 'Your ambassador link is paused for now. Your organizer will tell you more.',
    shareMsg: 'Hi! {event} is a free game jam for ages 13–18: you make your own video game in two days, no experience needed. Sign up with my link: {link}',
    posterTitle: 'Make your own video game in 2 days', posterFacts: 'Free · ages 13–18 · no experience needed', posterScan: 'Scan to sign up', posterBy: 'Invited by {name}',
    posterPrint: 'Print', posterShowName: 'Show my name on the poster', posterBack: '← Back to my page',
    welcome: '🎉 Congratulations, {name} — you are a {event} ambassador!\n\nYour page (only for you) — your link, QR code, poster and numbers:\n{page}\n\nYour link for friends: {link}\n\nYour job: get friends from your school to sign up with it. Questions? Write to me.',
    boardTitle: '🏆 Ambassadors — top 5 ({date})', boardFoot: 'Rewards are given at the event, when your friends come. Your link and numbers are on your page.', boardNone: 'No names yet — send your link!',
  },
  uz: {
    i_ambassador: 'Maktab ambassadori (maktabimni olib kelaman)',
    refBy: 'Seni {name} taklif qildi!', refLede: 'Ikki kunda oʻz video oʻyiningni yarat. Bepul, 13–18 yoshdagilar uchun, tajriba shart emas.',
    refName: 'Isming', refAge: 'Men 13–18 yoshdaman', refAgeNo: 'Haven 13–18 yoshdagilar uchun. Kattaroqmisan? Mentor yoki koʻngilli sifatida yordam bera olasan.',
    refGo: 'Keyingi qadam: roʻyxatdan oʻtish', refSkip: 'Oʻtkazib yuborish — toʻgʻridan-toʻgʻri roʻyxatdan oʻtish', nameShort: 'Ismingni yoz.',
    refPrivacy: 'Biz faqat isming va shu kodni saqlaymiz — seni kim taklif qilganini bilish uchun. Ularni {date} kuni oʻchirib tashlaymiz.',
    refNext: 'Oxirgi qadam: Hack Club sahifasida rasmiy roʻyxatdan oʻtish (1 daqiqa).', refOpen: 'Roʻyxatdan oʻtish sahifasini ochish', refGoing: 'Roʻyxatdan oʻtish sahifasiga oʻtyapmiz…',
    refNoSignup: 'Roʻyxatdan oʻtish hali ochilmagan. Yangiliklar — kanalimizda.',
    ambHi: 'Salom, {name}!', ambLede: 'Sen {event} ambassadorisan. Vazifang oddiy: maktabingdagi doʻstlaring sening havolang orqali roʻyxatdan oʻtsin.',
    ambLink: 'Sening havolang', ambCode: 'Kod', ambCopy: 'Nusxalash', ambCopied: 'Nusxalandi!', ambShare: 'Telegramda ulashish',
    ambQr: 'Sening QR koding', ambQrSub: 'Doʻstlaring uni telefon kamerasi bilan skanerlaydi.', ambPoster: 'QR kodli A4 plakat', ambSaveQr: 'QR kodni saqlash',
    ambNumbers: 'Sening natijalaring', ambSigned: 'sening havolang orqali roʻyxatdan oʻtdi', ambCame: 'tadbirga keldi', ambWeek: 'bu hafta: {n}',
    ambOff: 'Hozircha doʻstlaring toʻgʻridan-toʻgʻri rasmiy roʻyxat sahifasiga oʻtadi. Hisob boshlanganda natijalaring shu yerda chiqadi.',
    ambRewards: 'Mukofotlar', ambRewardsSub: 'tadbir kuni, doʻstlaring kelganda beriladi',
    ambTop: 'Eng faol 5 ambassador', ambTopNames: 'roʻyxatdan oʻtgan doʻstlar soni boʻyicha', ambTopCame: 'kelgan doʻstlar soni boʻyicha', ambTopNone: 'Hali hech kim yoʻq — birinchi boʻl!', ambYou: 'sen',
    ambHow: 'Qanday qilish kerak', ambHow1: 'Pastdagi xabarni sinfingning Telegram guruhiga yubor.', ambHow2: 'Plakatni chop etib, maktabga os — avval oʻqituvchidan ruxsat soʻra.',
    ambHow3: 'Havolang yoki QR koding bilan story joyla.', ambHow4: '5 ta doʻstingga shaxsan ayt. Bu eng yaxshi ishlaydi.',
    ambMsg: 'Sinf guruhing uchun xabar', ambGroup: 'Ambassadorlar guruhi', ambGroupBtn: 'Guruhni ochish', ambBuddy: 'Savol boʻlsa, yoz: {name}',
    ambGone: 'Bu havola endi ishlamaydi. Uni senga bergan tashkilotchidan yangisini soʻra.', ambPaused: 'Ambassador havolang hozircha toʻxtatilgan. Tashkilotching batafsil aytib beradi.',
    shareMsg: 'Salom! {event} — 13–18 yoshdagilar uchun bepul geymjem: ikki kunda oʻz video oʻyiningni yaratasan, tajriba shart emas. Mening havolam orqali roʻyxatdan oʻt: {link}',
    posterTitle: 'Ikki kunda oʻz video oʻyiningni yarat', posterFacts: 'Bepul · 13–18 yosh · tajriba shart emas', posterScan: 'Skanerla va roʻyxatdan oʻt', posterBy: 'Taklif qiluvchi: {name}',
    posterPrint: 'Chop etish', posterShowName: 'Plakatda ismimni koʻrsatish', posterBack: '← Sahifamga qaytish',
    welcome: '🎉 Tabriklaymiz, {name} — sen {event} ambassadorisan!\n\nSening sahifang (faqat sen uchun) — havolang, QR koding, plakat va natijalaring:\n{page}\n\nDoʻstlaring uchun havolang: {link}\n\nVazifang: maktabingdagi doʻstlaring shu havola orqali roʻyxatdan oʻtsin. Savol boʻlsa, menga yoz.',
    boardTitle: '🏆 Ambassadorlar — eng faol 5 ({date})', boardFoot: 'Mukofotlar tadbir kuni, doʻstlaring kelganda beriladi. Havolang va natijalaring — sahifangda.', boardNone: 'Hali natija yoʻq — havolangni yubor!',
  },
  ru: {
    i_ambassador: 'Амбассадор школы (приведу свою школу)',
    refBy: 'Тебя пригласил(а) {name}!', refLede: 'Создай свою видеоигру за два дня. Бесплатно, для 13–18 лет, опыт не нужен.',
    refName: 'Твоё имя', refAge: 'Мне 13–18 лет', refAgeNo: 'Haven — для 13–18 лет. Старше? Можешь помочь как ментор или волонтёр.',
    refGo: 'Дальше: регистрация', refSkip: 'Пропустить — сразу к регистрации', nameShort: 'Напиши своё имя.',
    refPrivacy: 'Мы сохраняем только твоё имя и этот код — чтобы знать, кто тебя пригласил. Удалим их {date}.',
    refNext: 'Последний шаг: официальная регистрация на странице Hack Club (1 минута).', refOpen: 'Открыть страницу регистрации', refGoing: 'Переходим на страницу регистрации…',
    refNoSignup: 'Регистрация ещё не открыта. Следи за новостями в нашем канале.',
    ambHi: 'Привет, {name}!', ambLede: 'Ты амбассадор {event}. Задача простая: друзья из твоей школы регистрируются по твоей ссылке.',
    ambLink: 'Твоя ссылка', ambCode: 'Код', ambCopy: 'Копировать', ambCopied: 'Скопировано!', ambShare: 'Поделиться в Telegram',
    ambQr: 'Твой QR-код', ambQrSub: 'Друзья сканируют его камерой телефона.', ambPoster: 'Плакат A4 с твоим QR-кодом', ambSaveQr: 'Сохранить QR-код',
    ambNumbers: 'Твои результаты', ambSigned: 'зарегистрировались по твоей ссылке', ambCame: 'пришли на мероприятие', ambWeek: 'за неделю: {n}',
    ambOff: 'Пока друзья попадают сразу на официальную страницу регистрации. Твои результаты появятся здесь, когда начнётся подсчёт.',
    ambRewards: 'Награды', ambRewardsSub: 'выдаются на мероприятии, когда друзья придут',
    ambTop: 'Топ-5 амбассадоров', ambTopNames: 'по числу зарегистрированных друзей', ambTopCame: 'по числу пришедших друзей', ambTopNone: 'Пока никого — будь первым!', ambYou: 'ты',
    ambHow: 'Как это сделать', ambHow1: 'Отправь сообщение ниже в Telegram-чат своего класса.', ambHow2: 'Распечатай плакат и повесь в школе — сначала спроси учителя.',
    ambHow3: 'Выложи сторис со своей ссылкой или QR-кодом.', ambHow4: 'Расскажи лично 5 друзьям. Это работает лучше всего.',
    ambMsg: 'Сообщение для чата класса', ambGroup: 'Группа амбассадоров', ambGroupBtn: 'Открыть группу', ambBuddy: 'Вопросы? Пиши: {name}',
    ambGone: 'Эта ссылка больше не работает. Попроси новую у организатора, который её дал.', ambPaused: 'Твоя ссылка амбассадора пока на паузе. Организатор расскажет подробнее.',
    shareMsg: 'Привет! {event} — бесплатный геймджем для 13–18 лет: за два дня делаешь свою видеоигру, опыт не нужен. Регистрируйся по моей ссылке: {link}',
    posterTitle: 'Создай свою видеоигру за 2 дня', posterFacts: 'Бесплатно · 13–18 лет · опыт не нужен', posterScan: 'Сканируй и регистрируйся', posterBy: 'Приглашает: {name}',
    posterPrint: 'Печать', posterShowName: 'Показать моё имя на плакате', posterBack: '← Назад на мою страницу',
    welcome: '🎉 Поздравляем, {name} — ты амбассадор {event}!\n\nТвоя страница (только для тебя) — ссылка, QR-код, плакат и результаты:\n{page}\n\nТвоя ссылка для друзей: {link}\n\nЗадача: друзья из твоей школы регистрируются по ней. Вопросы — пиши мне.',
    boardTitle: '🏆 Амбассадоры — топ-5 ({date})', boardFoot: 'Награды выдаются на мероприятии, когда друзья придут. Ссылка и результаты — на твоей странице.', boardNone: 'Пока без результатов — отправь свою ссылку!',
  },
};
Object.keys(AMB).forEach(l => Object.assign(T[l], AMB[l]));

/** Dates in the page's language. Uzbek is written out here: many browsers (and app web views) have no Uzbek month names and print "M11 14". */
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_DAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const at = ymd => new Date(String(ymd).slice(0, 10) + 'T12:00:00Z');
/** "14-noyabr" · "14 ноября" · "14 November" (weekday: "Shanba, 14-noyabr" · "сб, 14 нояб."). */
export function dayIn(ymd, lang, { weekday = false } = {}) {
  const d = at(ymd);
  if (isNaN(d)) return String(ymd || '');
  if (lang === 'uz') return (weekday ? UZ_DAYS[d.getUTCDay()] + ', ' : '') + d.getUTCDate() + '-' + UZ_MONTHS[d.getUTCMonth()];
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', Object.assign({ day: 'numeric', month: weekday ? 'short' : 'long', timeZone: 'UTC' }, weekday ? { weekday: 'short' } : {}));
}
/** "14–15-noyabr, 2026" · "14–15 ноября 2026" · "14–15 November 2026" — two full dates when the months differ. */
export function rangeIn(start, end, lang) {
  const a = at(start), b = at(end || start), y = String(end || start).slice(0, 4);
  if (!end || end === start) return dayIn(start, lang) + (lang === 'uz' ? ', ' : ' ') + y;
  if (a.getUTCMonth() === b.getUTCMonth()) return a.getUTCDate() + '–' + dayIn(end, lang) + (lang === 'uz' ? ', ' : ' ') + y;
  return dayIn(start, lang) + ' – ' + dayIn(end, lang) + (lang === 'uz' ? ', ' : ' ') + y;
}

/** What the Apply form stores: the English label (Dashboard → Applications and the areas use it), whatever language the form was in. */
export const INTERESTS = ['design', 'social', 'outreach', 'sponsors', 'tech', 'event', 'ambassador', 'mentor', 'other'];
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
