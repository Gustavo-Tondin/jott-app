// Portuguese (Brazil). Each key mirrors services/strings.js and holds a pair:
// the English it was translated FROM, then the translation. When the English
// in strings.js no longer matches, the key is stale and the app shows English
// there until the pair is updated — `npm run i18n` lists them. Same order
// and section comments as strings.js, so the two diff alike.
export default {
  // App shell
  storageIntro: [
    "To keep your notebook in a folder you choose — and to let a sync app " +
      "like Syncthing reach it — Jott needs permission to manage files. " +
      "Android opens its Settings screen; turn Jott on there and come back.",
    "Para guardar seu caderno numa pasta que você escolhe — e deixar um app " +
      "de sincronização como o Syncthing alcançá-la — o Jott precisa de " +
      "permissão para gerenciar arquivos. O Android abre a tela de " +
      "Configurações dele; ligue o Jott lá e volte.",
  ],
  pickANotebook: ["Pick a notebook", "Escolha um caderno"],
  createNotebook: ["Create a new notebook", "Criar um caderno novo"],
  openNotebook: ["Open a notebook", "Abrir um caderno"],
  notebookCounts: [
    (notes, tasks) =>
      `${notes === 1 ? "1 note" : `${notes} notes`} \u00b7 ${
        tasks === 1 ? "1 task" : `${tasks} tasks`
      }`,
    (notes, tasks) =>
      `${notes === 1 ? "1 nota" : `${notes} notas`} \u00b7 ${
        tasks === 1 ? "1 tarefa" : `${tasks} tarefas`
      }`,
  ],
  ago: [
    ({ unit, count } = {}) => {
      switch (unit) {
        case "now":
          return "just now";
        case "minute":
          return count === 1 ? "1 min ago" : `${count} min ago`;
        case "hour":
          return count === 1 ? "1 hour ago" : `${count} hours ago`;
        case "day":
          return count === 1 ? "1 day ago" : `${count} days ago`;
        case "month":
          return count === 1 ? "1 month ago" : `${count} months ago`;
        case "year":
          return count === 1 ? "1 year ago" : `${count} years ago`;
        default:
          return "";
      }
    },
    ({ unit, count } = {}) => {
      switch (unit) {
        case "now":
          return "agora mesmo";
        case "minute":
          return count === 1 ? "há 1 min" : `há ${count} min`;
        case "hour":
          return count === 1 ? "há 1 hora" : `há ${count} horas`;
        case "day":
          return count === 1 ? "há 1 dia" : `há ${count} dias`;
        case "month":
          return count === 1 ? "há 1 mês" : `há ${count} meses`;
        case "year":
          return count === 1 ? "há 1 ano" : `há ${count} anos`;
        default:
          return "";
      }
    },
  ],
  confirmForget: [
    (name) => `Remove ${name} from the list?`,
    (name) => `Remover ${name} da lista?`,
  ],
  today: ["Today", "Hoje"],

  // Tasks
  confirmDeleteTasks: [
    (n) => (n === 1 ? "Delete 1 task?" : `Delete ${n} tasks?`),
    (n) => (n === 1 ? "Excluir 1 tarefa?" : `Excluir ${n} tarefas?`),
  ],

  // Trash
  trashDaysLeft: [
    (n) => (n <= 0 ? "clears today" : n === 1 ? "1 day left" : `${n} days left`),
    (n) => (n <= 0 ? "some hoje" : n === 1 ? "falta 1 dia" : `faltam ${n} dias`),
  ],

  // Shortcuts
  shortcutScope: [
    (scope) =>
      ({
        global: "Anywhere",
        tasks: "In a task list",
        editor: "While writing a note",
      })[scope] ?? scope,
    (scope) =>
      ({
        global: "Em qualquer lugar",
        tasks: "Numa lista de tarefas",
        editor: "Escrevendo uma nota",
      })[scope] ?? scope,
  ],

  // Undo
  nothingToUndo: ["Nothing to undo", "Nada para desfazer"],
  nothingToRedo: ["Nothing to redo", "Nada para refazer"],
  undoOfferAction: ["Undo", "Desfazer"],

  // Settings
  dateFormat: ["Date format", "Formato de data"],
  language: ["Language", "Idioma"],
  languageSystem: ["System", "Sistema"],
  mode: ["Mode", "Modo"],
  theme: ["Theme", "Tema"],

  // Calendar
  months: [
    [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ],
  ],
  // Sunday-first, matching JavaScript's getDay().
  weekdaysShort: [
    ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  ],
  weekdays: [
    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"],
  ],

  // Colours
  colorName: [
    (slot) =>
      ({
        1: "Blue",
        2: "Purple",
        3: "Pink",
        4: "Red",
        5: "Orange",
        6: "Yellow",
        7: "Green",
        neutral: "Neutral",
      })[slot] ?? slot,
    (slot) =>
      ({
        1: "Azul",
        2: "Roxo",
        3: "Rosa",
        4: "Vermelho",
        5: "Laranja",
        6: "Amarelo",
        7: "Verde",
        neutral: "Neutro",
      })[slot] ?? slot,
  ],
};
