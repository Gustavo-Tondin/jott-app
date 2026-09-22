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

  // Shell
  home: ["Home", "Início"],
  tasks: ["Tasks", "Tarefas"],

  // Notes
  notes: ["Notes", "Notas"],

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

  // Errors
  errorKind: [
    (kind) =>
      ({
        io: "A file could not be read or written",
        notANotebook: "That folder is not a Jott notebook",
        notebook: "That is not a notebook",
        notASpace: "That folder is not a space",
        legacyNotebook: "That notebook is from an older Jott",
        alreadyANotebook: "That folder already holds a notebook",
        taskNotFound: "That task is no longer there",
        dayGone: "That day has passed",
        invalidDay: "That is not a day",
        invalidListName: "That name can't be used for a list",
        invalidSpaceName: "That name can't be used for a space",
        invalidName: "That name can't be used for a folder",
        invalidNotePath: "That name can't be used for a note",
        invalidAssetPath: "That is not a file of this notebook",
        readOnlyNotebook: "This notebook was written by a newer Jott and opens read-only",
        invalid: "That answer could not be used",
        protected: "The app creates that one; it can't be renamed or deleted",
        watch: "Jott stopped following changes to the notebook",
        theme: "That theme can't be used",
        stale: "That can't be undone: the files changed since",
        noNotebook: "No notebook is open",
        settings: "That setting can't be reset",
        platform: "This system can't do that",
        unsupported: "This system can't do that",
        window: "The window could not be opened",
        poisoned: "Something went wrong; reopen the notebook",
      })[kind] ?? kind,
    (kind) =>
      ({
        io: "Não foi possível ler ou gravar um arquivo",
        notANotebook: "Essa pasta não é um caderno do Jott",
        notebook: "Isso não é um caderno",
        notASpace: "Essa pasta não é um space",
        legacyNotebook: "Esse caderno é de um Jott antigo",
        alreadyANotebook: "Essa pasta já tem um caderno",
        taskNotFound: "Essa tarefa não está mais lá",
        dayGone: "Esse dia já passou",
        invalidDay: "Isso não é um dia",
        invalidListName: "Esse nome não serve para uma lista",
        invalidSpaceName: "Esse nome não serve para um space",
        invalidName: "Esse nome não serve para uma pasta",
        invalidNotePath: "Esse nome não serve para uma nota",
        invalidAssetPath: "Isso não é um arquivo deste caderno",
        readOnlyNotebook: "Este caderno foi gravado por um Jott mais novo e abre somente para leitura",
        invalid: "Não foi possível usar essa resposta",
        protected: "O app cria esse; ele não pode ser renomeado nem excluído",
        watch: "O Jott parou de acompanhar as mudanças do caderno",
        theme: "Não é possível usar esse tema",
        stale: "Não dá para desfazer: os arquivos mudaram desde então",
        noNotebook: "Nenhum caderno está aberto",
        settings: "Não é possível redefinir essa configuração",
        platform: "Este sistema não faz isso",
        unsupported: "Este sistema não faz isso",
        window: "Não foi possível abrir a janela",
        poisoned: "Algo deu errado; abra o caderno de novo",
      })[kind] ?? kind,
  ],
};
