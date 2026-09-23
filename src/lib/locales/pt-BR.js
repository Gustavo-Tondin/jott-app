// Portuguese (Brazil). Each key mirrors services/strings.js and holds a pair:
// the English it was translated FROM, then the translation. When the English
// in strings.js no longer matches, the key is stale and the app shows English
// there until the pair is updated — `npm run i18n` lists them. Same order
// and section comments as strings.js, so the two diff alike.
export default {
  actionNames: [
    {
      create_task: "New task",
      edit_task_text: "Rename task",
      set_task_pinned: "Pin task",
      move_task_to: "Reorder tasks",
      move_task: "Move task",
      duplicate_task: "Duplicate task",
      complete_task: "Complete task",
      uncomplete_task: "Reopen task",
      delete_task: "Delete task",
      create_list: "New list",
      rename_list: "Rename list",
      delete_list: "Delete list",
      pull_into: "Add to a day",
      remove_from: "Remove from a day",
      set_day_order: "Reorder the day",
      set_day_pinned: "Pin for today",
      set_day_sort: "Sort the day",
      quick_capture_note: "Quick note",
      create_note: "New note",
      delete_note: "Delete note",
      rename_note: "Rename note",
      move_note: "Move note",
      move_note_to_space: "Move note",
      set_note_pinned: "Pin note",
      set_note_banner: "Note banner",
      set_note_lang: "Note language",
      duplicate_note: "Duplicate note",
      create_note_folder: "New folder",
      rename_note_folder: "Rename folder",
      delete_note_folder: "Delete folder",
      set_note_folder_color: "Folder colour",
      set_note_folder_pinned: "Pin folder",
      create_space_in: "New space",
      rename_space: "Rename space",
      delete_space: "Delete space",
      move_space: "Move space",
      set_space_appearance: "Space colour and icon",
      set_space_sort: "Sort space",
      set_space_order: "Reorder space",
      set_space_note_layout: "Board layout",
      create_group: "New group",
      rename_group: "Rename group",
      delete_group: "Delete group",
      move_group: "Move group",
      set_group_appearance: "Group colour and icon",
      set_order: "Reorder sidebar",
      set_spaces_sort: "Sort sidebar",
      set_rainbow_spaces: "Sidebar colours",
      set_tag: "Save tag",
      remove_tag: "Remove tag",
      restore_from_trash: "Restore from trash",
      purge_from_trash: "Delete for good",
      empty_trash: "Empty trash",
      set_notebook_settings: "Change a setting",
      reset_settings: "Reset a settings section",
      set_feature: "Switch a function",
      set_shortcut: "Change a shortcut",
      reset_shortcuts: "Reset shortcuts",
    },
    {
      create_task: "Nova tarefa",
      edit_task_text: "Renomear tarefa",
      set_task_pinned: "Fixar tarefa",
      move_task_to: "Reordenar tarefas",
      move_task: "Mover tarefa",
      duplicate_task: "Duplicar tarefa",
      complete_task: "Concluir tarefa",
      uncomplete_task: "Reabrir tarefa",
      delete_task: "Excluir tarefa",
      create_list: "Nova lista",
      rename_list: "Renomear lista",
      delete_list: "Excluir lista",
      pull_into: "Adicionar a um dia",
      remove_from: "Tirar de um dia",
      set_day_order: "Reordenar o dia",
      set_day_pinned: "Fixar para hoje",
      set_day_sort: "Ordenar o dia",
      quick_capture_note: "Nota rápida",
      create_note: "Nova nota",
      delete_note: "Excluir nota",
      rename_note: "Renomear nota",
      move_note: "Mover nota",
      move_note_to_space: "Mover nota",
      set_note_pinned: "Fixar nota",
      set_note_banner: "Banner da nota",
      set_note_lang: "Idioma da nota",
      duplicate_note: "Duplicar nota",
      create_note_folder: "Nova pasta",
      rename_note_folder: "Renomear pasta",
      delete_note_folder: "Excluir pasta",
      set_note_folder_color: "Cor da pasta",
      set_note_folder_pinned: "Fixar pasta",
      create_space_in: "Novo space",
      rename_space: "Renomear space",
      delete_space: "Excluir space",
      move_space: "Mover space",
      set_space_appearance: "Cor e ícone do space",
      set_space_sort: "Ordenar space",
      set_space_order: "Reordenar space",
      set_space_note_layout: "Layout do quadro",
      create_group: "Novo grupo",
      rename_group: "Renomear grupo",
      delete_group: "Excluir grupo",
      move_group: "Mover grupo",
      set_group_appearance: "Cor e ícone do grupo",
      set_order: "Reordenar a barra lateral",
      set_spaces_sort: "Ordenar a barra lateral",
      set_rainbow_spaces: "Cores da barra lateral",
      set_tag: "Salvar tag",
      remove_tag: "Remover tag",
      restore_from_trash: "Restaurar da lixeira",
      purge_from_trash: "Excluir de vez",
      empty_trash: "Esvaziar a lixeira",
      set_notebook_settings: "Mudar uma configuração",
      reset_settings: "Redefinir uma seção das configurações",
      set_feature: "Ligar ou desligar uma função",
      set_shortcut: "Mudar um atalho",
      reset_shortcuts: "Redefinir os atalhos",
    },
  ],
  undoOffers: [
    {
      delete_task: "Task deleted",
      delete_note: "Note deleted",
      delete_list: "List deleted",
      delete_space: "Space deleted",
      delete_group: "Group deleted",
      delete_note_folder: "Folder deleted",
      remove_from: "Removed from the day",
      move_task: "Task moved",
      move_note: "Note moved",
      move_note_to_space: "Note moved",
    },
    {
      delete_task: "Tarefa excluída",
      delete_note: "Nota excluída",
      delete_list: "Lista excluída",
      delete_space: "Space excluído",
      delete_group: "Grupo excluído",
      delete_note_folder: "Pasta excluída",
      remove_from: "Tirada do dia",
      move_task: "Tarefa movida",
      move_note: "Nota movida",
      move_note_to_space: "Nota movida",
    },
  ],

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
  allowFiles: ["Allow file access", "Permitir acesso aos arquivos"],
  usePrivateFolder: ["Use Jott's private folder instead", "Usar a pasta privada do Jott"],
  privateFolderNote: [
    "Kept inside the app. Nothing else on the phone can read it, and " +
      "uninstalling Jott deletes it.",
    "Fica dentro do app. Nada mais no celular consegue lê-la, e " +
      "desinstalar o Jott a apaga.",
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
  notebookOptions: ["notebook options", "opções do caderno"],
  notebookMenu: ["switch notebook", "trocar de caderno"],
  manageNotebooks: ["Manage notebooks", "Gerenciar cadernos"],
  notebooksOptions: ["screen options", "opções da tela"],
  keepPickerOpen: [
    "Keep this screen open after opening a notebook",
    "Manter esta tela aberta depois de abrir um caderno",
  ],
  openAppOnPicker: ["Open Jott on this screen", "Abrir o Jott nesta tela"],
  closeNotebooks: ["Close", "Fechar"],
  notebookReadOnly: ["read-only", "somente leitura"],
  renameNotebook: ["Rename notebook", "Renomear caderno"],
  renameNotebookPrompt: ["New name for the notebook:", "Novo nome do caderno:"],
  moveNotebook: ["Move notebook\u2026", "Mover caderno…"],
  revealNotebook: ["Show in file manager", "Mostrar no gerenciador de arquivos"],
  forgetNotebook: ["Remove from the list", "Remover da lista"],
  confirmForget: [(name) => `Remove ${name} from the list?`, (name) => `Remover ${name} da lista?`],
  confirmForgetDetail: [
    "The notebook stays exactly where it is on disk \u2014 only this list forgets it. " +
      "Open it again from \u201cOpen a notebook\u201d whenever you like.",
    "O caderno fica exatamente onde está no disco — só esta lista o esquece. " +
      "Abra-o de novo por “Abrir um caderno” quando quiser.",
  ],
  browseFolders: ["Choose a folder", "Escolher uma pasta"],
  parentFolder: ["Up one folder", "Subir uma pasta"],
  newFolder: ["New folder", "Nova pasta"],
  newFolderName: ["Name for the new folder:", "Nome da nova pasta:"],
  useThisFolder: ["Use this folder", "Usar esta pasta"],
  noSubfolders: ["No folders here.", "Nenhuma pasta aqui."],
  existingNotebook: ["notebook", "caderno"],
  today: ["Today", "Hoje"],
  completed: ["Completed", "Concluídas"],
  menu: ["menu", "menu"],
  tagsManagement: ["Tags management", "Gerenciar tags"],
  trash: ["Trash", "Lixeira"],
  readOnly: ["read-only", "somente leitura"],
  renameList: ["rename list", "renomear lista"],
  deleteList: ["delete list", "excluir lista"],
  promptRenameList: [(name) => `New name for "${name}":`, (name) => `Novo nome para "${name}":`],
  confirmDeleteList: [
    (name) =>
      `Delete "${name}"? Remaining tasks go to the Inbox.`,
    (name) =>
      `Excluir "${name}"? As tarefas que sobrarem vão para a Inbox.`,
  ],
  tasksRescued: [
    (count, name) =>
      `${count} task(s) from "${name}" were moved to the Inbox.`,
    (count, name) =>
      `${count} tarefa(s) de "${name}" foram movidas para a Inbox.`,
  ],
  conflictsTitle: [
    (count) =>
      count === 1 ? "1 sync conflict in this notebook" : `${count} sync conflicts in this notebook`,
    (count) =>
      count === 1
        ? "1 conflito de sincronização neste caderno"
        : `${count} conflitos de sincronização neste caderno`,
  ],
  conflictsBody: [
    "The same file was changed on two devices before they could sync, and " +
      "Jott could not combine the two versions. Pick the one to keep — if in " +
      "doubt, the newer one. The other goes to the Trash, so nothing is lost.",
    "O mesmo arquivo foi alterado em dois aparelhos antes que eles pudessem " +
      "sincronizar, e o Jott não conseguiu juntar as duas versões. Escolha a " +
      "que fica — na dúvida, a mais nova. A outra vai para a Lixeira, então " +
      "nada se perde.",
  ],
  conflictReveal: ["Show in folder", "Mostrar na pasta"],
  conflictSettings: ["Notebook settings", "Configurações do caderno"],
  conflictTags: ["Tag colors", "Cores das tags"],
  conflictTrash: ["Trash list", "Lista da lixeira"],
  conflictInUse: ["Version in use", "Versão em uso"],
  conflictOther: ["Other version", "Outra versão"],
  conflictNewer: ["newer", "mais nova"],
  conflictVersionFacts: [
    (when, size) => (when ? `Edited ${when} \u00b7 ${size}` : size),
    (when, size) => (when ? `Editada ${when} · ${size}` : size),
  ],
  conflictInUseGone: ["Deleted on this device", "Excluída neste aparelho"],
  conflictKeep: ["Keep", "Manter"],
  conflictKeepInUse: [
    (name) => `Keep the version in use of ${name}`,
    (name) => `Manter a versão em uso de ${name}`,
  ],
  conflictKeepOther: [
    (name) => `Keep the other version of ${name}`,
    (name) => `Manter a outra versão de ${name}`,
  ],
  conflictsDiscardAll: ["Keep every version in use", "Manter todas as versões em uso"],
  confirmAdoptConflict: [
    (name) =>
      `Replace "${name}" with the other version? The version in use goes to the Trash.`,
    (name) =>
      `Substituir "${name}" pela outra versão? A versão em uso vai para a Lixeira.`,
  ],
  conflictAdopt: ["Replace", "Substituir"],
  conflictsHide: ["Hide for now", "Ocultar por enquanto"],
  fileSize: [
    (bytes) =>
      bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
          ? `${(bytes / 1024).toFixed(1)} KB`
          : `${(bytes / (1024 * 1024)).toFixed(1)} MB`,
    (bytes) =>
      bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
          ? `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`
          : `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`,
  ],
  conflictLinesDiffer: [
    (count) =>
      count === 1 ? "1 line differs" : `${count} lines differ`,
    (count) =>
      count === 1 ? "1 linha difere" : `${count} linhas diferem`,
  ],
  conflictTasksDiffer: [
    (count, first) =>
      count === 1
        ? `"${first}" changed on both devices`
        : `"${first}" and ${count - 1} more changed on both devices`,
    (count, first) =>
      count === 1
        ? `"${first}" mudou nos dois aparelhos`
        : `"${first}" e mais ${count - 1} mudaram nos dois aparelhos`,
  ],
  conflictUnseen: [
    "no earlier copy on this device to compare with",
    "nenhuma cópia anterior neste aparelho para comparar",
  ],
  revealHiddenHint: [
    'In Files, turn on "Show hidden files" in the \u22ee menu to see this folder.',
    'No app Arquivos, ligue "Mostrar arquivos ocultos" no menu ⋮ para ver esta pasta.',
  ],
  pathCopied: [
    "No app could open the folder — its path was copied",
    "Nenhum app conseguiu abrir a pasta — o caminho dela foi copiado",
  ],
  merged: [
    (count, name) =>
      count === 1
        ? `Merged 1 change from another device into ${name}`
        : `Merged ${count} changes from another device into ${name}`,
    (count, name) =>
      count === 1
        ? `1 alteração de outro aparelho mesclada em ${name}`
        : `${count} alterações de outro aparelho mescladas em ${name}`,
  ],
  mergedFiles: [
    (count) => `Merged changes from another device into ${count} files`,
    (count) => `Alterações de outro aparelho mescladas em ${count} arquivos`,
  ],
  dismissError: ["ok", "ok"],
  errorTitle: ["Something went wrong", "Algo deu errado"],
  openingNotebook: [
    (name) => (name ? `Opening ${name}…` : "Opening the notebook…"),
    (name) => (name ? `Abrindo ${name}…` : "Abrindo o caderno…"),
  ],
  openFailedTitle: ["This notebook could not be opened", "Não foi possível abrir este caderno"],
  openFailedRetry: ["Try again", "Tentar de novo"],
  openFailedOther: ["Open another one", "Abrir outro"],

  // Spaces
  readOnlySpace: ["read-only (newer version)", "somente leitura (versão mais nova)"],
  missingSpace: [
    "This page is no longer in the notebook.",
    "Esta página não está mais no caderno.",
  ],
  newList: ["New list", "Nova lista"],
  newNotepad: ["New notepad", "Novo bloco de notas"],
  promptNewList: ["Name of the new list:", "Nome da nova lista:"],
  promptNewNotepad: ["Name of the new notepad:", "Nome do novo bloco de notas:"],
  promptRenameSpace: [(name) => `New name for "${name}":`, (name) => `Novo nome para "${name}":`],
  confirmDeleteSpace: [
    (name) => `Delete "${name}"? It goes to the trash.`,
    (name) => `Excluir "${name}"? Ele vai para a lixeira.`,
  ],
  renameSpace: ["Rename", "Renomear"],
  deleteSpace: ["Delete", "Excluir"],
  spaceAppearance: ["Colour & icon", "Cor e ícone"],
  iconOnly: ["Icon", "Ícone"],
  color: ["colour", "cor"],
  icon: ["icon", "ícone"],
  defaultAppearance: ["default", "padrão"],
  searchIcons: ["Search icons", "Buscar ícones"],
  iconsCount: [
    (n) => (n === 1 ? "1 icon" : `${n} icons`),
    (n) => (n === 1 ? "1 ícone" : `${n} ícones`),
  ],
  iconsNone: ["No icon matches that.", "Nenhum ícone corresponde."],
  unsupportedSpaceTitle: [
    (kind) =>
      kind ? `"${kind}" space` : "Space without a type",
    (kind) =>
      kind ? `Space "${kind}"` : "Space sem tipo",
  ],
  unsupportedSpaceBody: [
    "This version of Jott does not know how to show this space. " +
      "Its files are untouched — a newer version may support it.",
    "Esta versão do Jott não sabe mostrar este space. " +
      "Os arquivos dele estão intactos — uma versão mais nova pode suportá-lo.",
  ],
  spaceNoLists: ["No list in this space yet.", "Nenhuma lista neste space ainda."],
  cancel: ["Cancel", "Cancelar"],
  create: ["Create", "Criar"],
  newTask: ["New task", "Nova tarefa"],
  mainList: ["Inbox", "Inbox"],
  noTasksYet: ["No tasks yet", "Nenhuma tarefa ainda"],
  spaceOptions: ["space options", "opções do space"],
  selectTasks: ["Reorder tasks…", "Reordenar tarefas…"],
  selectedCount: [(n) => `${n} selected`, (n) => (n === 1 ? "1 selecionado" : `${n} selecionados`)],
  moveTo: ["Move to…", "Mover para…"],
  deleteSelected: ["Delete", "Excluir"],
  confirmDeleteTasks: [
    (n) => (n === 1 ? "Delete 1 task?" : `Delete ${n} tasks?`),
    (n) => (n === 1 ? "Excluir 1 tarefa?" : `Excluir ${n} tarefas?`),
  ],
  confirmDeleteNotes: [
    (n) => (n === 1 ? "Delete 1 note?" : `Delete ${n} notes?`),
    (n) => (n === 1 ? "Excluir 1 nota?" : `Excluir ${n} notas?`),
  ],
  sortFileOrder: ["File order", "Ordem do arquivo"],
  sortByName: ["Sort by name", "Ordenar por nome"],
  sortByType: ["Sort by type", "Ordenar por tipo"],
  searchTag: [(name) => `Search #${name}`, (name) => `Buscar #${name}`],
  sortByCreated: ["Sort by creation date", "Ordenar por data de criação"],
  sortByCompleted: ["Sort by completion date", "Ordenar por data de conclusão"],
  sortByDue: ["Sort by due date", "Ordenar por prazo"],
  sortCustom: ["Custom order (dragged)", "Ordem personalizada (arrastada)"],
  sortDirection: ["Direction", "Direção"],
  sortDirectionOf: [
    (sort, up) =>
      ({
        name: up ? "Z to A" : "A to Z",
        created: up ? "Oldest first" : "Newest first",
        due: up ? "Latest due first" : "Soonest due first",
      })[sort] ?? (up ? "Up" : "Down"),
    (sort, up) =>
      ({
        name: up ? "Z a A" : "A a Z",
        created: up ? "Mais antigas primeiro" : "Mais novas primeiro",
        due: up ? "Prazo mais distante primeiro" : "Prazo mais próximo primeiro",
      })[sort] ?? (up ? "Para cima" : "Para baixo"),
  ],
  createTaskPlaceholder: ["Create a task…", "Criar uma tarefa…"],
  completedCount: [(n) => `Completed ${n}`, (n) => `Concluídas ${n}`],
  newGroup: ["New group", "Novo grupo"],
  nameGroup: ["Name for the new group", "Nome do novo grupo"],
  moveToGroup: ["Move to group", "Mover para um grupo"],
  removeFromGroup: ["Remove from group", "Tirar do grupo"],
  renameGroup: ["Rename group", "Renomear grupo"],
  deleteGroup: ["Delete group", "Excluir grupo"],
  collapseGroup: ["collapse group", "recolher grupo"],
  expandGroup: ["expand group", "expandir grupo"],
  rainbowSpaces: ["Auto-rainbow spaces", "Arco-íris automático nos spaces"],
  sortTasks: ["Sort", "Ordenar"],
  pinTask: ["Pin to top", "Fixar no topo"],
  unpinTask: ["Unpin", "Desfixar"],
  confirmDeleteGroup: [
    (name) =>
      `Delete the group "${name}"? What it holds moves up one level; the group goes to the trash.`,
    (name) =>
      `Excluir o grupo "${name}"? O que ele contém sobe um nível; o grupo vai para a lixeira.`,
  ],
  trashTitle: ["Trash", "Lixeira"],
  trashEmpty: ["The trash is empty.", "A lixeira está vazia."],
  trashEmptyHint: [
    "Anything you delete waits here, and can be put back.",
    "Tudo o que você exclui espera aqui, e pode ser devolvido.",
  ],
  trashLoading: ["Reading the trash…", "Lendo a lixeira…"],
  trashAll: ["All", "Tudo"],
  trashTasks: ["Tasks", "Tarefas"],
  trashFiles: ["Files", "Arquivos"],
  trashKindTask: ["task", "tarefa"],
  trashKindFile: ["file or folder", "arquivo ou pasta"],
  trashNoneOfKind: ["Nothing of this kind in the trash.", "Nada desse tipo na lixeira."],
  restore: ["Restore", "Restaurar"],
  trashHint: [
    "Deleted items wait here before they are cleared for good.",
    "Os itens excluídos esperam aqui antes de serem apagados de vez.",
  ],
  trashDaysLeft: [
    (n) => (n <= 0 ? "clears today" : n === 1 ? "1 day left" : `${n} days left`),
    (n) => (n <= 0 ? "some hoje" : n === 1 ? "falta 1 dia" : `faltam ${n} dias`),
  ],
  trashKeptForever: ["kept until you restore it", "guardado até você restaurar"],
  restoreItem: ["Restore", "Restaurar"],
  deleteForever: ["Delete forever", "Excluir de vez"],
  emptyTrash: ["Empty trash", "Esvaziar a lixeira"],
  confirmDeleteForever: [
    (label) => `Delete "${label}" for good?`,
    (label) => `Excluir "${label}" de vez?`,
  ],
  confirmEmptyTrash: [
    (n) => (n === 1 ? "Delete the 1 item for good?" : `Delete all ${n} items for good?`),
    (n) => (n === 1 ? "Excluir o 1 item de vez?" : `Excluir todos os ${n} itens de vez?`),
  ],
  deleteForeverDetail: [
    "This cannot be undone — it is the one thing in Jott that is not kept.",
    "Isso não pode ser desfeito — é a única coisa no Jott que não fica guardada.",
  ],
  tagsEmpty: [
    "No tags yet. Add one from a task.",
    "Nenhuma tag ainda. Adicione uma a partir de uma tarefa.",
  ],
  tagsEmptyHint: [
    "Type #word in a task, or name a tag here so the picker offers it.",
    "Digite #palavra numa tarefa, ou dê nome a uma tag aqui para o seletor oferecê-la.",
  ],
  tagsLoading: ["Counting the tags…", "Contando as tags…"],
  tagsFilter: ["Filter tags", "Filtrar tags"],
  tagsFilterEmpty: ["No tag matches that.", "Nenhuma tag corresponde."],
  tagUses: [
    (n) => (n === 0 ? "not in use" : n === 1 ? "1 task" : `${n} tasks`),
    (n) => (n === 0 ? "sem uso" : n === 1 ? "1 tarefa" : `${n} tarefas`),
  ],
  tagUncatalogued: ["not in the picker yet", "ainda não está no seletor"],
  newTagName: ["New tag name", "Nome da nova tag"],
  deleteTag: ["Delete tag", "Excluir tag"],
  confirmDeleteTag: [(name) => `Delete the tag "${name}"?`, (name) => `Excluir a tag "${name}"?`],
  tagTextStays: [
    "It leaves the picker; the #tag text in tasks stays.",
    "Ela sai do seletor; o texto #tag nas tarefas fica.",
  ],

  // App Functions
  featureTasks: ["Tasks", "Tarefas"],
  featureNotes: ["Notes", "Notas"],
  featureSubtasks: ["Subtasks", "Subtarefas"],
  featureTaskTags: ["Task tags", "Tags de tarefa"],
  featureDueDate: ["Complete date", "Prazo"],
  featureRepeat: ["Repeat", "Repetir"],
  featurePriority: ["Priority", "Prioridade"],
  featureDescription: ["Description", "Descrição"],
  featureFiles: ["Add files", "Adicionar arquivos"],
  featureRemind: ["Remind me", "Lembrar"],
  featureBanners: ["Banners", "Banners"],
  featureWikiLinks: ["WikiLinks [[ ]]", "WikiLinks [[ ]]"],
  featureEmbeds: ["Embedded images and files", "Imagens e arquivos incorporados"],
  featureNoteFolders: ["Note folders", "Pastas de notas"],
  featurePinNotes: ["Pin notes", "Fixar notas"],
  featureNoteTags: ["Note tags", "Tags de nota"],
  noteCreated: ["created", "criada"],
  noteTags: ["tags", "tags"],
  featureTables: ["Tables", "Tabelas"],
  featureFixedSpaces: ["Fixed spaces", "Spaces fixos"],
  fixedSpacesHelp: ["What hiding a fixed space does", "O que esconder um space fixo faz"],
  helpAbout: [(label) => `About ${label}`, (label) => `Sobre ${label}`],
  fixedSpacesHelpIntro: [
    "The app's own spaces — Home, Tasks and Notes — as sidebar shortcuts " +
      "and screens. Hiding one only takes it off the interface: the files " +
      "stay, and everything returns when the space does.",
    "Os spaces do próprio app — Início, Tarefas e Notas — como atalhos da " +
      "barra lateral e telas. Esconder um só o tira da interface: os arquivos " +
      "ficam, e tudo volta quando o space voltar.",
  ],
  fixedSpacesHelpTasks: [
    "Tasks: hiding the screen hides the Inbox. The day lives on the Home, " +
      "and stays: a task can still be pulled into today from any list.",
    "Tarefas: esconder a tela esconde a Inbox. O dia mora no Início, e " +
      "fica: uma tarefa ainda pode ser puxada para hoje de qualquer lista.",
  ],
  fixedSpacesHelpNotes: [
    "Notes: quick notes can go to another notepad; the notes written today " +
      "still show on the Home.",
    "Notas: as notas rápidas podem ir para outro bloco de notas; as notas " +
      "escritas hoje continuam aparecendo no Início.",
  ],
  featureHomeSpace: ["Home space", "Space Início"],
  featureTasksSpace: ["Tasks space", "Space Tarefas"],
  featureNotesSpace: ["Notes space", "Space Notas"],

  // The time axis
  featureTime: ["Time", "Tempo"],
  featureTimeline: ["Timeline", "Linha do tempo"],
  timelineGhostTasks: [
    "Name deleted tasks in the Timeline",
    "Mostrar o nome das tarefas excluídas na Linha do tempo",
  ],
  timelineGhostNotes: [
    "Name deleted notes in the Timeline",
    "Mostrar o nome das notas excluídas na Linha do tempo",
  ],
  timelineGhostHint: [
    "Off, a deleted item is only counted — \u201c3 deleted tasks\u201d " +
      "in the colour of its space. The log keeps the name either way; to " +
      "drop the line itself, use \u201cRemove from timeline\u201d on the item.",
    "Desligado, um item excluído só é contado — “3 tarefas excluídas” " +
      "na cor do space dele. O registro guarda o nome de qualquer jeito; para " +
      "tirar a própria linha, use “Remover da linha do tempo” no item.",
  ],

  // The Timeline screen
  timeline: ["Timeline", "Linha do tempo"],
  myTimeline: ["My Timeline", "Minha linha do tempo"],
  thisMonth: ["This month", "Este mês"],
  statNotes: ["Notes", "Notas"],
  statTasks: ["Tasks", "Tarefas"],
  statCompleted: ["Completed", "Concluídas"],
  tasksCreated: [
    (n) => (n === 1 ? "1 Task created" : `${n} Tasks created`),
    (n) => (n === 1 ? "1 Tarefa criada" : `${n} Tarefas criadas`),
  ],
  tasksCompleted: [
    (n) => (n === 1 ? "1 Task completed" : `${n} Tasks completed`),
    (n) => (n === 1 ? "1 Tarefa concluída" : `${n} Tarefas concluídas`),
  ],
  notesCreated: [
    (n) => (n === 1 ? "1 Note created" : `${n} Notes created`),
    (n) => (n === 1 ? "1 Nota criada" : `${n} Notas criadas`),
  ],
  deletedTasks: [
    (n) => (n === 1 ? "1 deleted task" : `${n} deleted tasks`),
    (n) => (n === 1 ? "1 tarefa excluída" : `${n} tarefas excluídas`),
  ],
  deletedNotes: [
    (n) => (n === 1 ? "1 deleted note" : `${n} deleted notes`),
    (n) => (n === 1 ? "1 nota excluída" : `${n} notas excluídas`),
  ],
  deletedTask: ["Deleted task", "Tarefa excluída"],
  deletedNote: ["Deleted note", "Nota excluída"],
  nothingInTimeline: ["Nothing here yet.", "Nada aqui ainda."],
  nothingInTimelineHint: [
    "Every task and note you write lands here, on the month it was born.",
    "Toda tarefa e nota que você escreve cai aqui, no mês em que nasceu.",
  ],
  removeFromTimeline: ["Remove from timeline", "Remover da linha do tempo"],
  removeFromTimelineDetail: [
    "This forgets it from the log for good — the task or note itself is not touched.",
    "Isso o apaga do registro de vez — a tarefa ou a nota em si não é tocada.",
  ],
  timelineLoadingYear: [(year) => `Reading ${year}\u2026`, (year) => `Lendo ${year}…`],
  goToYear: [(year) => `Go to ${year}`, (year) => `Ir para ${year}`],
  timelineTimes: [(n) => `\u00d7${n}`, (n) => `×${n}`],
  timelineOccurrences: [(n) => `${n} occurrences this month`, (n) => `${n} ocorrências neste mês`],
  timelineOptions: ["timeline item options", "opções do item da linha do tempo"],

  // The shortcuts table in Settings
  sectionShortcuts: ["Shortcuts", "Atalhos"],
  sectionShortcutsHint: [
    "Click a key to record a new one. Escape keeps it.",
    "Clique numa tecla para gravar uma nova. Esc mantém a atual.",
  ],
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
  pressAKey: ["Press a key…", "Pressione uma tecla…"],
  noShortcut: ["None", "Nenhum"],
  changeShortcut: ["Record a new key", "Gravar uma tecla nova"],
  clearShortcut: ["Remove this key", "Remover esta tecla"],
  shortcutNotBindable: ["That would swallow typing", "Isso engoliria a digitação"],
  shortcutTaken: [(name) => `Already: ${name}`, (name) => `Já é: ${name}`],
  resetShortcuts: ["Reset to defaults", "Restaurar o padrão"],
  formatting: ["Formatting", "Formatação"],
  formattingDocked: ["In the side panel", "No painel lateral"],
  formattingFloating: ["Floating over the note", "Flutuando sobre a nota"],
  formattingDock: ["Dock the formatting panel", "Encaixar o painel de formatação"],
  noteTextSize: ["Text size", "Tamanho do texto"],
  noteSizeSmall: ["Small", "Pequeno"],
  noteSizeMedium: ["Medium", "Médio"],
  noteSizeLarge: ["Large", "Grande"],
  noteFontSizeLabel: ["Note text size", "Tamanho do texto da nota"],
  hyphenateNotesLabel: ["Hyphenate note text", "Hifenizar o texto das notas"],
  hyphenateNotesHint: [
    "Breaks a long word across two lines so the right edge stops jumping. " +
      "It only happens on screen: the .md file keeps every word whole. Follows " +
      "each note's language, and needs the system's hyphenation rules for it — " +
      "where they are missing, nothing changes.",
    "Quebra uma palavra longa em duas linhas para a margem direita parar de " +
      "pular. Só acontece na tela: o arquivo .md guarda cada palavra inteira. " +
      "Segue o idioma de cada nota e precisa das regras de hifenização do " +
      "sistema para ele — onde elas faltam, nada muda.",
  ],

  // The floating formatting bar of an open note
  formatBarLabel: ["Formatting bar", "Barra de formatação"],
  formatBarFloating: ["Floating", "Flutuante"],
  formatBarPanel: ["In the side panel", "No painel lateral"],
  formatBarOff: ["Off", "Desligada"],
  formatBarHint: [
    "How the bar opens with a note. While the note is open, the ⋮ menu " +
      "moves it between floating and the side panel.",
    "Como a barra abre com uma nota. Com a nota aberta, o menu ⋮ " +
      "a alterna entre flutuante e o painel lateral.",
  ],
  formatBarSideLabel: ["Bar position", "Posição da barra"],
  formatBarSideTop: ["Top", "Em cima"],
  formatBarSideLeft: ["Left", "À esquerda"],
  formatBarSideRight: ["Right", "À direita"],
  formatBarSideBottom: ["Bottom", "Embaixo"],

  // Commands
  cmdNewTask: ["New task", "Nova tarefa"],
  cmdNewNote: ["New note", "Nova nota"],
  cmdSearch: ["Search the whole notebook", "Buscar no caderno inteiro"],
  cmdFindHere: ["Find on this screen", "Localizar nesta tela"],
  cmdNotebooks: ["Notebooks", "Cadernos"],
  cmdSettings: ["Settings", "Configurações"],
  cmdFullscreen: ["Fullscreen", "Tela cheia"],
  cmdToggleSidebar: ["Show/hide the sidebar", "Mostrar/ocultar a barra lateral"],
  cmdRename: ["Rename what is open", "Renomear o que está aberto"],
  cmdZoomIn: ["Zoom in", "Aumentar o zoom"],
  cmdZoomOut: ["Zoom out", "Diminuir o zoom"],
  cmdZoomReset: ["Reset zoom", "Redefinir o zoom"],
  cmdNewTab: ["New tab", "Nova aba"],
  cmdCloseTab: ["Close tab", "Fechar aba"],
  cmdNextTab: ["Next tab", "Próxima aba"],
  cmdPreviousTab: ["Previous tab", "Aba anterior"],
  cmdLastTab: ["Last tab", "Última aba"],
  cmdGoToTab: [(n) => `Go to tab ${n}`, (n) => `Ir para a aba ${n}`],
  cmdBack: ["Back", "Voltar"],
  cmdForward: ["Forward", "Avançar"],
  cmdTaskUp: ["Select the task above", "Selecionar a tarefa de cima"],
  cmdTaskDown: ["Select the task below", "Selecionar a tarefa de baixo"],
  cmdTaskOpen: ["Open the task", "Abrir a tarefa"],
  cmdTaskComplete: ["Complete/reopen the task", "Concluir/reabrir a tarefa"],
  cmdTaskMoveUp: ["Move the task up", "Subir a tarefa"],
  cmdTaskMoveDown: ["Move the task down", "Descer a tarefa"],
  cmdTaskDelete: ["Delete the task", "Excluir a tarefa"],
  cmdTaskDuplicate: ["Duplicate the task", "Duplicar a tarefa"],
  movedTo: [
    (name, at, of) => `${name} moved to position ${at} of ${of}`,
    (name, at, of) => `${name} movida para a posição ${at} de ${of}`,
  ],
  cmdBold: ["Bold", "Negrito"],
  cmdItalic: ["Italic", "Itálico"],
  cmdStrike: ["Strikethrough", "Tachado"],
  cmdInlineCode: ["Inline code", "Código em linha"],
  cmdLink: ["Link", "Link"],
  cmdHeading: [(n) => `Heading ${n}`, (n) => `Título ${n}`],
  cmdParagraph: ["Plain paragraph", "Parágrafo simples"],
  cmdBulletList: ["Bullet list", "Lista com marcadores"],
  cmdOrderedList: ["Numbered list", "Lista numerada"],
  cmdTaskList: ["Checkbox", "Caixa de seleção"],
  cmdQuote: ["Quote", "Citação"],
  cmdQuotationMarks: ["Quotation marks", "Aspas"],
  cmdCodeBlock: ["Code block", "Bloco de código"],
  cmdRule: ["Horizontal rule", "Linha horizontal"],
  cmdReplace: ["Find and replace", "Localizar e substituir"],
  cmdUnderline: ["Underline", "Sublinhado"],
  cmdIndent: ["Indent", "Aumentar recuo"],
  cmdOutdent: ["Outdent", "Diminuir recuo"],
  cmdReference: ["Link to a note", "Link para uma nota"],
  cmdAttach: ["Insert a file", "Inserir um arquivo"],
  cmdUndo: ["Undo", "Desfazer"],
  cmdRedo: ["Redo", "Refazer"],
  cmdUndoAction: ["Undo last action", "Desfazer a última ação"],
  cmdRedoAction: ["Redo last action", "Refazer a última ação"],
  undone: [(what) => `Undone: ${what}`, (what) => `Desfeito: ${what}`],
  redone: [(what) => `Redone: ${what}`, (what) => `Refeito: ${what}`],
  nothingToUndo: ["Nothing to undo", "Nada para desfazer"],
  nothingToRedo: ["Nothing to redo", "Nada para refazer"],
  undoStale: [
    "That can't be undone: the files changed since (a sync, another window).",
    "Não dá para desfazer: os arquivos mudaram desde então (uma sincronização, outra janela).",
  ],
  undoOfferAction: ["Undo", "Desfazer"],
  undoOfferGone: [
    "Something else changed since, so nothing was undone. Ctrl+Z steps back through it all.",
    "Outra coisa mudou desde então, e nada foi desfeito. Ctrl+Z volta passo a passo por tudo.",
  ],
  formatMarks: ["Text style", "Estilo do texto"],
  formatHeadings: ["Heading", "Título"],
  formatBlocks: ["Block", "Bloco"],
  formatLayout: ["Layout", "Disposição"],
  formatLists: ["List", "Lista"],
  formatInsert: ["Insert", "Inserir"],
  formatTable: ["Table", "Tabela"],
  cmdTableInsert: ["Insert table", "Inserir tabela"],
  cmdTableAddColumn: ["Add column to the right", "Adicionar coluna à direita"],
  cmdTableAddRow: ["Add row below", "Adicionar linha abaixo"],
  cmdTableDeleteColumn: ["Delete column", "Excluir coluna"],
  cmdTableDeleteRow: ["Delete row", "Excluir linha"],
  cmdTableResetWidths: ["Reset column widths", "Redefinir larguras das colunas"],
  cmdTableDelete: ["Delete table", "Excluir tabela"],
  tableColumn: ["Column", "Coluna"],
  tableCell: ["Table cell", "Célula da tabela"],
  tableHeaderCell: ["Header cell", "Célula de cabeçalho"],
  tableMoveColumn: ["Move column", "Mover coluna"],
  tableMoveRow: ["Move row", "Mover linha"],
  tableResizeColumn: [
    "Drag to resize, double-click to reset",
    "Arraste para redimensionar, clique duas vezes para redefinir",
  ],
  copyCode: ["Copy code", "Copiar código"],
  codeCopied: ["Copied", "Copiado"],

  // Settings
  settings: ["Settings", "Configurações"],
  settingsSaved: ["Saved.", "Salvo."],
  settingsSections: ["Settings", "Configurações"],
  settingsFunctions: ["App functions", "Funções do app"],
  sectionNative: ["Native Functions", "Funções nativas"],
  sectionNativeHint: [
    "Everything Jott can do. Switching one off takes it out of the whole " +
      "interface — sidebar, tabs, buttons — and touches nothing on disk: your " +
      "files keep every field, and it all comes back when you switch it on.",
    "Tudo o que o Jott sabe fazer. Desligar uma função a tira da interface " +
      "inteira — barra lateral, abas, botões — e não toca em nada no disco: seus " +
      "arquivos guardam cada campo, e tudo volta quando você a liga de novo.",
  ],
  openFunction: [(name) => `${name} options`, (name) => `Opções de ${name}`],
  sectionDates: ["Date preferences", "Preferências de data"],
  sectionDay: ["Day and calendar", "Dia e calendário"],
  sectionDisplay: ["Display", "Exibição"],
  sectionDisplayHint: [
    "These answer for this device, not for the notebook — a phone can be dark " +
      "while the desktop stays in Jott's own. Until one is chosen here, the " +
      "notebook's own choice is what shows.",
    "Estas respondem por este aparelho, não pelo caderno — um celular pode " +
      "ficar escuro enquanto o computador fica no modo do Jott. Até uma ser " +
      "escolhida aqui, vale a escolha do caderno.",
  ],
  sectionNotebook: ["Notebook", "Caderno"],
  rolloverMode: ["At midnight, unfinished tasks", "À meia-noite, as tarefas não terminadas"],
  rolloverModeReset: ["go back to suggestions", "voltam para as sugestões"],
  rolloverModeCarry: ["stay pulled", "continuam no dia"],
  weekStartsOn: ["Week starts on", "A semana começa em"],
  subCalendar: ["Calendar", "Calendário"],
  datedTasksJoinPeriod: [
    "A task with a date joins its day",
    "Uma tarefa com data entra no seu dia",
  ],
  datedTasksJoinPeriodHint: [
    "On by default: a task dated for the 5th shows up on the 5th on its own, " +
      "and one that is overdue shows up today. Nothing is written to the " +
      "notebook — take the date away and it leaves. Off, a day is a 100% " +
      "deliberate choice and a date only ranks the suggestions.",
    "Ligado por padrão: uma tarefa com data para o dia 5 aparece sozinha no " +
      "dia 5, e uma atrasada aparece hoje. Nada é escrito no caderno — tire a " +
      "data e ela sai. Desligado, um dia é 100% escolha sua e a data só ordena " +
      "as sugestões.",
  ],
  monday: ["Monday", "Segunda-feira"],
  sunday: ["Sunday", "Domingo"],
  dateFormat: ["Date format", "Formato de data"],
  language: ["Language", "Idioma"],
  languageSystem: ["System", "Sistema"],
  mode: ["Mode", "Modo"],
  modeJott: ["Contrast", "Contraste"],
  modeJottHint: ["Black frame, white page.", "Moldura preta, página branca."],
  modeLight: ["Light", "Claro"],
  modeLightHint: ["Light throughout.", "Claro em tudo."],
  modeDark: ["Dark", "Escuro"],
  modeDarkHint: ["Dark throughout.", "Escuro em tudo."],
  theme: ["Theme", "Tema"],
  themeJott: ["Jott", "Jott"],
  themeJottMeta: ["the app's own", "o do próprio app"],
  themesFromNotebookHint: [
    "A theme is a .css file — or a folder with theme.css inside — in " +
      ".jott/themes/. It sets the colours, spacing and radius, and wears any " +
      "mode. Saving the file repaints the app.",
    "Um tema é um arquivo .css — ou uma pasta com theme.css dentro — em " +
      ".jott/themes/. Ele define as cores, o espaçamento e o raio, e veste " +
      "qualquer modo. Salvar o arquivo repinta o app.",
  ],
  themeBy: [(author) => `by ${author}`, (author) => `por ${author}`],
  themeNeedsNewerApp: [
    (version) =>
      `Made for Jott ${version} or newer — parts of the app may go unpainted.`,
    (version) =>
      `Feito para o Jott ${version} ou mais novo — partes do app podem ficar sem pintura.`,
  ],
  themeUnreadable: [
    "This one could not be read. The app is wearing its own.",
    "Não foi possível ler este. O app está usando o próprio.",
  ],
  newThemeAction: ["New theme from this one", "Novo tema a partir deste"],
  themeBlockedRefs: [
    (n) =>
      n === 1
        ? "1 address pointing off this machine was blocked."
        : `${n} addresses pointing off this machine were blocked.`,
    (n) =>
      n === 1
        ? "1 endereço apontando para fora desta máquina foi bloqueado."
        : `${n} endereços apontando para fora desta máquina foram bloqueados.`,
  ],
  accentColor: ["Accent colour", "Cor de destaque"],
  headingColor: ["Headings", "Títulos"],
  headingColorAccent: ["Accent", "Destaque"],
  headingColorAccentHint: [
    "Titles take the colour of the place they live in.",
    "Os títulos ganham a cor do lugar onde moram.",
  ],
  headingColorInk: ["Ink", "Tinta"],
  headingColorInkHint: [
    "Titles in plain text colour, like a document.",
    "Títulos na cor do texto, como num documento.",
  ],
  restoreLastScreen: ["Reopen on the last screen", "Reabrir na última tela"],
  showListCounts: [
    "Show task counts in the sidebar",
    "Mostrar a contagem de tarefas na barra lateral",
  ],
  autoUrgentByDate: ["Treat overdue tasks as urgent", "Tratar tarefas atrasadas como urgentes"],
  newTasksGoTo: ["New tasks go to", "Tarefas novas vão para"],
  newTasksTop: ["Top of the list", "O topo da lista"],
  newTasksBottom: ["Bottom of the list", "O fim da lista"],
  autoUrgentByDateHint: [
    "The #urgent tag written by hand always counts, either way.",
    "A tag #urgent escrita à mão sempre conta, de um jeito ou de outro.",
  ],
  dayNotice: ["Day summary", "Resumo do dia"],
  dayNoticeTime: ["Summary time", "Horário do resumo"],
  dayNoticeHint: [
    "One notification at the start of the day, listing the tasks the day holds. " +
      "A task only rings on its own if you gave it a reminder.",
    "Uma notificação no começo do dia, listando as tarefas que o dia tem. " +
      "Uma tarefa só toca sozinha se você deu um lembrete a ela.",
  ],
  reminderTime: ["Reminder time", "Horário do lembrete"],
  reminderTimeHint: [
    "The hour the task panel's reminder presets land on.",
    "O horário em que caem os lembretes prontos do painel da tarefa.",
  ],
  reminderNotifications: ["Notifications", "Notificações"],
  reminderNotificationsHint: [
    "Reminders and the day summary are notifications. Blocked, nothing rings.",
    "Lembretes e o resumo do dia são notificações. Bloqueadas, nada toca.",
  ],
  reminderExactAlarms: ["Exact alarms", "Alarmes exatos"],
  reminderExactAlarmsHint: [
    "Without them Android rings a reminder when it saves the battery best, minutes late.",
    "Sem eles o Android toca o lembrete quando for melhor para a bateria, minutos depois.",
  ],
  reminderAccessAllowed: ["Allowed", "Permitido"],
  reminderAccessBlocked: ["Blocked", "Bloqueado"],
  reminderAccessAllow: ["Allow", "Permitir"],
  closeToTray: [
    "Keep Jott running in the tray when the window closes",
    "Manter o Jott na bandeja quando a janela fechar",
  ],
  closeToTrayHint: [
    "Reminders ring while Jott waits in the tray. On GNOME the tray icon needs the AppIndicator extension.",
    "Os lembretes tocam enquanto o Jott espera na bandeja. No GNOME, o ícone da bandeja precisa da extensão AppIndicator.",
  ],
  autostart: ["Start Jott with the system", "Iniciar o Jott com o sistema"],
  autostartHint: ["Opens hidden in the tray.", "Abre escondido na bandeja."],
  quitApp: ["Quit Jott", "Sair do Jott"],
  closeOnClickAway: [
    "Close the task panel when clicking outside",
    "Fechar o painel da tarefa ao clicar fora",
  ],
  hideTopBar: ["Hide the top bar", "Esconder a barra superior"],
  hideTopBarHint: [
    "Tap a screen's name to open the sidebar, hold it for the tabs; back is the phone's gesture. An open note keeps its buttons.",
    "Toque no nome da tela para abrir a barra lateral e segure para ver as abas; voltar é o gesto do celular. A nota aberta mantém os botões.",
  ],
  quickNoteFolder: ["Quick note goes to", "A nota rápida vai para"],

  // The function pages
  subColours: ["Colours", "Cores"],
  subText: ["Text", "Texto"],
  subEditor: ["Editor", "Editor"],
  subInterface: ["Interface", "Interface"],
  subLocation: ["Location", "Local"],
  subSafety: ["Safety", "Segurança"],
  resetSection: ["Reset this section", "Redefinir esta seção"],
  resetSectionTitle: ["Reset this section?", "Redefinir esta seção?"],
  resetSectionDetail: [
    "Every option on this page goes back to what the app ships with.",
    "Todas as opções desta página voltam ao que o app traz.",
  ],
  resetSectionAction: ["Reset", "Redefinir"],
  subKeeping: ["Keeping", "Retenção"],
  notebookContents: ["Notebook contents", "Conteúdo do caderno"],
  notebookContentsLine: [
    ({ notes, tasks, files, bytes }) => {
      const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
      const mb = bytes / (1024 * 1024);
      const size = mb < 0.1 ? `${Math.ceil(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
      return `${n(notes, "note", "notes")} \u00b7 ${n(tasks, "task", "tasks")} \u00b7 ${n(files, "file", "files")} \u00b7 ${size}`;
    },
    ({ notes, tasks, files, bytes }) => {
      const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
      const mb = bytes / (1024 * 1024);
      const size = mb < 0.1 ? `${Math.ceil(bytes / 1024)} KB` : `${mb.toFixed(1).replace(".", ",")} MB`;
      return `${n(notes, "nota", "notas")} · ${n(tasks, "tarefa", "tarefas")} · ${n(files, "arquivo", "arquivos")} · ${size}`;
    },
  ],
  shortcutFilter: ["Filter commands", "Filtrar comandos"],
  subScreens: ["Screens", "Telas"],
  subBehaviour: ["Behaviour", "Comportamento"],
  subFields: ["Fields", "Campos"],
  subNoteHas: ["What a note can have", "O que uma nota pode ter"],
  noteLayout: ["Notes board layout", "Layout do quadro de notas"],
  subTasksScreen: ["Tasks screen", "Tela de tarefas"],
  allListsTitle: ["All lists", "Todas as listas"],
  tasksShowAll: ["Tasks screen shows", "A tela de tarefas mostra"],
  tasksShowAllInbox: ["the Inbox only", "só a Inbox"],
  tasksShowAllEvery: ["every list, arranged by space", "todas as listas, arrumadas por space"],
  moreFieldsTitle: ["Tasks can do more", "Tarefas podem fazer mais"],
  moreFieldsBody: [
    (names) => `Switched off right now: ${names}.`,
    (names) => `Desligados agora: ${names}.`,
  ],
  moreFieldsOpen: ["Add functions", "Adicionar funções"],
  moreFieldsDismiss: ["Not now", "Agora não"],
  quickTasksGoTo: ["Quick tasks go to", "Tarefas rápidas vão para"],
  subTables: ["Tables", "Tabelas"],
  tableLayout: ["Wide tables", "Tabelas largas"],
  tableLayoutFit: ["Fit the content width", "Caber na largura do conteúdo"],
  tableLayoutScroll: ["Scroll sideways", "Rolar para o lado"],
  subWriting: ["Writing", "Escrita"],
  writingLanguages: ["Languages I write in", "Idiomas em que escrevo"],
  writingLanguagesHint: [
    "The first is every note's language until a note says otherwise, from " +
      "its ⋮ → Language. With two or more, a note that doesn't say is read to " +
      "tell which. Hyphenation follows one language per note; the spell check " +
      "takes them all.",
    "O primeiro é o idioma de toda nota até que ela diga outro, pelo ⋮ → " +
      "Idioma. Com dois ou mais, a nota que não diz é lida para saber qual é. " +
      "A hifenização segue um idioma por nota; o corretor usa todos.",
  ],
  addWritingLanguage: ["Add a language…", "Adicionar idioma…"],
  removeWritingLanguage: [(name) => `Remove ${name}`, (name) => `Remover ${name}`],
  checkSpelling: ["Check spelling", "Verificar ortografia"],
  checkSpellingHint: [
    "Underlines the words no dictionary knows. On Linux it checks against " +
      "every language above; on Android and Windows the keyboard or the system " +
      "picks the languages.",
    "Sublinha as palavras que nenhum dicionário conhece. No Linux, confere " +
      "com todos os idiomas acima; no Android e no Windows, quem escolhe os " +
      "idiomas é o teclado ou o sistema.",
  ],
  noHyphenationDictionary: [
    (name) => `No hyphenation dictionary for ${name} on this computer`,
    (name) => `Sem dicionário de hifenização para ${name} neste computador`,
  ],
  noSpellingDictionary: [
    (name) => `No spelling dictionary for ${name} on this computer`,
    (name) => `Sem dicionário ortográfico para ${name} neste computador`,
  ],
  noteLanguage: ["Language", "Idioma"],
  noteLanguageAuto: [(name) => `Auto (${name})`, (name) => `Automático (${name})`],
  noteLayoutHint: [
    "How a notes space draws its board until it chooses for itself — each " +
      "space keeps its own choice, from its ⋮ → Layout.",
    "Como um space de notas desenha o quadro até escolher por conta própria — " +
      "cada space guarda a sua escolha, no ⋮ → Layout.",
  ],
  subImages: ["Images", "Imagens"],
  featureBannersHint: [
    "The colour or picture at the head of a note. Off, the editor draws no " +
      "band and the card is title and preview — the <!--banner:--> line in the " +
      "file stays exactly where it is.",
    "A cor ou a imagem no topo de uma nota. Desligado, o editor não desenha " +
      "a faixa e o cartão é título e prévia — a linha <!--banner:--> no " +
      "arquivo fica exatamente onde está.",
  ],
  confirmDeletes: ["Ask before deleting", "Perguntar antes de excluir"],
  confirmDeletesHint: [
    "Nothing is destroyed either way: a deleted note, list, space or file " +
      "goes to .jott/trash/ and comes back to where it was.",
    "Nada é destruído de um jeito ou de outro: uma nota, lista, space ou " +
      "arquivo excluído vai para .jott/trash/ e volta para onde estava.",
  ],
  confirmImageDownloads: [
    "Ask before downloading an image",
    "Perguntar antes de baixar uma imagem",
  ],
  confirmImageDownloadsHint: [
    "Pasting a picture copied from a web page hands Jott an address, not a " +
      "file, so drawing it means fetching it. The question says which site is " +
      "being contacted.",
    "Colar uma imagem copiada de uma página da web entrega ao Jott um " +
      "endereço, não um arquivo, então desenhá-la significa buscá-la. A " +
      "pergunta diz qual site está sendo contatado.",
  ],

  // Notebook / Location
  openNotebookFolder: ["Open notebook folder", "Abrir a pasta do caderno"],
  openNotebookFolderAction: ["Open", "Abrir"],
  switchNotebook: ["Switch notebook", "Trocar de caderno"],
  switchNotebookAction: ["Choose…", "Escolher…"],

  // Display / Text
  interfaceZoom: ["Interface zoom", "Zoom da interface"],
  interfaceZoomHint: ["The same thing Ctrl + and Ctrl − do.", "O mesmo que Ctrl + e Ctrl − fazem."],

  // Display / Interface
  cardHeightLabel: ["Note card height", "Altura do cartão de nota"],
  cardHeightHint: [
    "How much of a note a card on the board shows before it stops. The rest " +
      "of the note is always there — the card ends with an ellipsis.",
    "Quanto de uma nota um cartão do quadro mostra antes de parar. O resto " +
      "da nota continua lá — o cartão termina em reticências.",
  ],
  cardLinesValue: [(lines) => `${lines} lines`, (lines) => `${lines} linhas`],

  // The search over every row of every page
  settingsSearch: ["Search settings", "Buscar nas configurações"],
  settingsSearchEmpty: ["Nothing here matches that.", "Nada aqui corresponde a isso."],
  interfaceFontLabel: ["Interface font", "Fonte da interface"],
  noteFontLabel: ["Note font", "Fonte das notas"],
  monoFontLabel: ["Monospace font", "Fonte monoespaçada"],
  fontDefault: [(name) => `Default (${name})`, (name) => `Padrão (${name})`],
  fontDefaultNote: ["Same as the interface", "A mesma da interface"],
  fontGeneric: ["This system", "Deste sistema"],
  fontInstalled: ["Installed", "Instaladas"],
  fontsNotListed: [
    "Installed fonts are only listed on Linux.",
    "As fontes instaladas só são listadas no Linux.",
  ],
  settingsSearchIn: [(section) => `in ${section}`, (section) => `em ${section}`],
  completedRetention: ["Clear completed after (days)", "Limpar concluídas depois de (dias)"],
  completedRetentionHint: [
    "A finished task leaves its Completed list after this many days and waits " +
      "in the trash, so it is still recoverable. 0 keeps it forever.",
    "Uma tarefa terminada sai da lista de Concluídas depois de tantos dias e " +
      "espera na lixeira, então ainda dá para recuperá-la. 0 guarda para sempre.",
  ],
  trashRetentionHint: [
    "0 keeps deleted items until you clear them yourself.",
    "0 guarda os itens excluídos até você mesmo limpá-los.",
  ],
  trashRetention: ["Empty the trash after (days)", "Esvaziar a lixeira depois de (dias)"],
  notebookPath: ["Notebook location", "Local do caderno"],
  readOnlyNotice: [
    "This notebook was written by a newer version of Jott and is open for reading only.",
    "Este caderno foi escrito por uma versão mais nova do Jott e está aberto somente para leitura.",
  ],

  // About
  sectionAbout: ["About", "Sobre"],
  subVersion: ["Version", "Versão"],
  subSystem: ["System", "Sistema"],
  subHelp: ["Help", "Ajuda"],
  yourFiles: ["Your files", "Seus arquivos"],
  yourFilesHint: [
    "Every notebook documents its own format, in plain text, inside " +
      ".jott/_FORMAT.txt — so your notes stay readable without Jott.",
    "Todo caderno documenta o próprio formato, em texto puro, dentro de " +
      ".jott/_FORMAT.txt — assim suas notas continuam legíveis sem o Jott.",
  ],
  yourFilesAction: ["Open the folder", "Abrir a pasta"],
  reportIssue: ["Report an issue", "Relatar um problema"],
  reportIssueAction: ["Open GitHub", "Abrir o GitHub"],
  updateVersion: ["Version", "Versão"],
  updateAutoCheck: ["Check for updates automatically", "Procurar atualizações automaticamente"],
  updateAutoCheckHint: [
    "Once a day, Jott asks github.com for the number of the latest release — the only connection the app ever makes, and nothing about you or your notebook travels with it. Off means checking stays yours, with the button below.",
    "Uma vez por dia, o Jott pergunta ao github.com o número da versão mais recente — a única conexão que o app faz, e nada sobre você ou seu caderno vai junto. Desligado, procurar fica por sua conta, com o botão abaixo.",
  ],
  updateCheckNow: ["Check now", "Procurar agora"],
  updateChecking: ["Checking…", "Procurando…"],
  updateUpToDate: ["You have the latest version.", "Você tem a versão mais recente."],
  updateAvailable: [
    (version) => `Version ${version} is available.`,
    (version) => `A versão ${version} está disponível.`,
  ],
  updateBanner: [
    (version) => `A new version of Jott is out: ${version}.`,
    (version) => `Saiu uma versão nova do Jott: ${version}.`,
  ],
  updateInstall: ["Update and restart", "Atualizar e reiniciar"],
  updateInstalling: ["Updating…", "Atualizando…"],
  updateDownload: ["Download", "Baixar"],
  updateDismiss: ["Later", "Depois"],
  updateChannel: ["Updates", "Atualizações"],
  updateInstalled: [
    (version) => `Jott was updated to ${version}. Tap to open it.`,
    (version) => `O Jott foi atualizado para a ${version}. Toque para abrir.`,
  ],

  // The application menu
  menuEntryBanner: [
    "Jott is running as a single file, so it is not in your applications menu yet.",
    "O Jott está rodando como um arquivo só, então ainda não está no seu menu de aplicativos.",
  ],
  menuEntryAdd: ["Add to menu", "Adicionar ao menu"],
  menuEntryAdding: ["Adding…", "Adicionando…"],
  menuEntryDismiss: ["No thanks", "Não, obrigado"],
  menuEntryLabel: ["Show in applications menu", "Mostrar no menu de aplicativos"],
  menuEntryHint: [
    "Writes a launcher and an icon into your home folder (~/.local/share) so Jott shows up in the applications list and in search, the way an installed app does. It points at this file where it is now — move the file and switch this off and on again. Nothing outside your home folder is touched.",
    "Grava um atalho e um ícone na sua pasta pessoal (~/.local/share) para o Jott aparecer na lista de aplicativos e na busca, como um app instalado. Ele aponta para este arquivo onde ele está agora — se mover o arquivo, desligue e ligue isto de novo. Nada fora da sua pasta pessoal é tocado.",
  ],

  // Shell
  home: ["Home", "Início"],
  tasks: ["Tasks", "Tarefas"],
  inboxTab: ["Inbox", "Inbox"],
  openInNewTab: ["open in new tab", "abrir em nova aba"],
  openInNewTabItem: ["Open in new tab", "Abrir em nova aba"],
  closeTab: ["close tab", "fechar aba"],
  newTab: ["new tab", "nova aba"],

  // Title bar window controls (frameless window)
  minimizeWindow: ["minimize", "minimizar"],
  maximizeWindow: ["maximize", "maximizar"],
  closeWindow: ["close window", "fechar janela"],
  goBack: ["back", "voltar"],
  goForward: ["forward", "avançar"],
  pageMenu: ["page menu", "menu da página"],

  // The compact shell (below 768px)
  openTabs: [
    (count) => (count === 1 ? "1 open tab" : `${count} open tabs`),
    (count) => (count === 1 ? "1 aba aberta" : `${count} abas abertas`),
  ],
  openSidebar: ["open sidebar", "abrir barra lateral"],
  forwardItem: ["Forward", "Avançar"],
  tabsItem: [(count) => `Tabs (${count})`, (count) => `Abas (${count})`],
  closeSheet: ["close", "fechar"],
  closeComposer: ["close the new task bar", "fechar a barra de nova tarefa"],
  noteFindPlaceholder: ["Find", "Buscar"],
  noteReplacePlaceholder: ["Replace with", "Substituir por"],
  findNext: ["next match", "próxima ocorrência"],
  findPrevious: ["previous match", "ocorrência anterior"],
  findOptions: ["search options", "opções de busca"],
  findMatchCase: ["Match case", "Diferenciar maiúsculas"],
  findByWord: ["Whole words", "Palavras inteiras"],
  findRegexp: ["Regular expression", "Expressão regular"],
  findClose: ["close search", "fechar busca"],
  replaceOne: ["Replace", "Substituir"],
  replaceAll: ["All", "Todas"],
  capture: ["new", "novo"],
  task: ["Task", "Tarefa"],
  note: ["Note", "Nota"],
  todaysTasks: ["Today tasks", "Tarefas de hoje"],
  todaysNotes: ["Today notes", "Notas de hoje"],
  dayTasks: [(day) => `${day} tasks`, (day) => `Tarefas de ${day}`],
  shortDay: [
    (month, day) => `${month.slice(0, 3)} ${day}`,
    (month, day) => `${day} ${month.slice(0, 3).toLowerCase()}`,
  ],
  backToToday: ["back to today", "voltar para hoje"],
  previousWeek: ["previous week", "semana anterior"],
  nextWeek: ["next week", "próxima semana"],
  showOverview: ["show the day's summary", "mostrar o resumo do dia"],
  hideOverview: ["hide the day's summary", "esconder o resumo do dia"],
  showWeek: ["show the week", "mostrar a semana"],
  hideWeek: ["show less", "mostrar menos"],
  goodMorning: ["Good morning", "Bom dia"],
  goodAfternoon: ["Good afternoon", "Boa tarde"],
  goodEvening: ["Good evening", "Boa noite"],
  tasksDone: [
    (done, total) => `${done} of ${total} ${total === 1 ? "task" : "tasks"} done today.`,
    (done, total) => `${done} de ${total} ${total === 1 ? "tarefa concluída" : "tarefas concluídas"} hoje.`,
  ],
  daySummary: [
    ({ done, created, notes }) =>
      [
        `${done} ${done === 1 ? "task" : "tasks"} completed`,
        `${created} ${created === 1 ? "task" : "tasks"} created`,
        `${notes} ${notes === 1 ? "note" : "notes"} created`,
      ].join(", ") + ".",
    ({ done, created, notes }) =>
      [
        `${done} ${done === 1 ? "tarefa concluída" : "tarefas concluídas"}`,
        `${created} ${created === 1 ? "tarefa criada" : "tarefas criadas"}`,
        `${notes} ${notes === 1 ? "nota criada" : "notas criadas"}`,
      ].join(", ") + ".",
  ],
  tasksPlanned: [
    (n) => `${n} ${n === 1 ? "task" : "tasks"} planned.`,
    (n) => `${n} ${n === 1 ? "tarefa planejada" : "tarefas planejadas"}.`,
  ],
  nothingThatDay: ["Nothing happened that day.", "Nada aconteceu neste dia."],
  inboxNotes: ["Inbox notes", "Notas da Inbox"],
  inboxTasks: ["Inbox tasks", "Tarefas da Inbox"],
  quickNoteTo: ["to", "Salvar em"],
  quickNotesGoTo: ["Quick notes go to", "Notas rápidas vão para"],
  notesOptions: ["notes options", "opções das notas"],
  noNotesToday: ["No notes written today.", "Nenhuma nota escrita hoje."],
  collapseSidebar: ["collapse sidebar", "recolher barra lateral"],
  expandSidebar: ["expand sidebar", "expandir barra lateral"],
  untitled: ["Untitled", "Sem título"],

  // Notes
  notes: ["Notes", "Notas"],
  newNote: ["New note", "Nova nota"],
  newNoteTitle: ["New note", "Nova nota"],
  promptNewNote: ["Title of the new note:", "Título da nova nota:"],
  promptRenameNote: [
    (title) => `New title for "${title}":`,
    (title) => `Novo título para “${title}”:`,
  ],
  promptNewNoteFolder: ["Name of the new folder:", "Nome da nova pasta:"],
  newNoteFolder: ["New group", "Novo grupo"],
  folderOptions: ["folder options", "opções da pasta"],
  renameFolder: ["Rename", "Renomear"],
  deleteFolder: ["Delete", "Excluir"],
  promptRenameFolder: [(name) => `New name for "${name}":`, (name) => `Novo nome para “${name}”:`],
  confirmDeleteFolder: [
    (name) =>
      `Delete the folder "${name}"? Its notes and subfolders move up one level — nothing is deleted.`,
    (name) =>
      `Excluir a pasta “${name}”? As notas e subpastas dela sobem um nível — nada é excluído.`,
  ],
  folderEmptied: [
    (count, name) =>
      `${count} item(s) from "${name}" moved up one level.`,
    (count, name) =>
      `${count} item(s) de “${name}” subiram um nível.`,
  ],
  confirmDeleteNote: [(title) => `Delete "${title}"?`, (title) => `Excluir “${title}”?`],
  noNotes: ["No notes yet.", "Nenhuma nota ainda."],
  allNotes: ["All notes", "Todas as notas"],
  emptyNote: ["Empty note", "Nota vazia"],
  pin: ["Pin", "Fixar"],
  unpin: ["Unpin", "Desfixar"],
  deleteNote: ["Delete", "Excluir"],
  renameNote: ["Rename", "Renomear"],
  noteBodyPlaceholder: ["Write here…", "Escreva aqui…"],
  layout: ["Layout", "Layout"],
  gridView: ["Grid", "Grade"],
  treeView: ["Folders", "Pastas"],
  quickNote: ["Quick note…", "Nota rápida…"],
  addNote: ["Create the note", "Criar a nota"],
  duplicateNote: ["Duplicate", "Duplicar"],

  // Lists
  newTaskPlaceholder: ["New task…", "Nova tarefa…"],
  addTask: ["Add", "Adicionar"],
  emptyList: ["No tasks in this list.", "Nenhuma tarefa nesta lista."],
  pullToToday: ["→ Today", "→ Hoje"],

  // The day
  suggestionsTitle: ["Suggestions", "Sugestões"],
  suggestionsForDay: ["Suggestions for today", "Sugestões para hoje"],
  suggestionsFor: [(day) => `Suggestions for ${day}`, (day) => `Sugestões para ${day}`],
  noSuggestions: ["No tasks available.", "Nenhuma tarefa disponível."],
  groupUrgent: ["Urgent", "Urgente"],
  groupSoon: ["Soon", "Em breve"],
  groupRecent: ["Pulled recently", "Puxadas recentemente"],
  pull: ["pull", "puxar"],

  // Completed
  nothingCompleted: ["Nothing completed yet.", "Nada concluído ainda."],
  goesBackTo: [(name) => `back to ${name}`, (name) => `volta para ${name}`],

  // THE ACTION RING (components/ActionRing
  ringComplete: ["Complete", "Concluir"],
  ringReopen: ["Reopen", "Reabrir"],
  ringDay: ["My Day", "Meu dia"],
  ringDayOut: ["Take out", "Tirar"],
  ringPin: ["Pin", "Fixar"],
  ringUnpin: ["Unpin", "Desfixar"],
  ringMove: ["Move", "Mover"],
  ringMore: ["More", "Mais"],
  ringEdit: ["Edit", "Editar"],
  ringReorder: ["Reorder", "Reordenar"],
  ringDuplicate: ["Duplicate", "Duplicar"],
  ringDelete: ["Delete", "Excluir"],
  ringRename: ["Rename", "Renomear"],
  ringAppearance: ["Colour", "Cor"],
  ringActions: ["Card actions", "Ações do cartão"],
  deleteTaskItem: ["Delete task", "Excluir tarefa"],

  // Task row and inspector
  complete: ["complete", "concluir"],
  uncheck: ["uncheck", "desmarcar"],
  taskRowHint: [
    "click to open, double-click to rename",
    "clique para abrir, clique duas vezes para renomear",
  ],
  taskTitlePanel: ["Task title", "Título da tarefa"],
  taskTitleField: ["Title", "Título"],
  taskName: ["task name", "nome da tarefa"],
  closePanel: ["close", "fechar"],
  collapsePanel: ["collapse panel", "recolher painel"],
  collapseSubtasks: ["hide subtasks", "ocultar subtarefas"],
  expandSubtasks: ["show subtasks", "mostrar subtarefas"],
  myDay: ["Send to My Day", "Enviar para Meu dia"],
  removeFromDay: ["Take out of My Day", "Tirar de Meu dia"],
  taskOptions: ["task options", "opções da tarefa"],
  duplicateTask: ["Duplicate task", "Duplicar tarefa"],
  addTag: ["add tag", "adicionar tag"],
  completeDateLabel: ["Complete date", "Prazo"],
  addFilesLabel: ["Add files", "Adicionar arquivos"],
  deleteTask: ["delete task", "excluir tarefa"],
  moveToList: ["move to list", "mover para a lista"],
  subtaskLabel: [(text) => `subtask: ${text}`, (text) => `subtarefa: ${text}`],
  newSubtaskPlaceholder: ["New subtask…", "Nova subtarefa…"],
  removeSubtask: ["remove subtask", "remover subtarefa"],
  tagsTitle: ["Tags", "Tags"],
  removeTag: [(tag) => `remove #${tag}`, (tag) => `remover #${tag}`],
  descriptionTitle: ["Description", "Descrição"],
  dueDateLabel: ["Due date", "Prazo"],
  clearDate: ["clear date", "limpar data"],
  clearDateHint: ["clear", "limpar"],
  pickDate: ["pick date", "escolher data"],
  prevMonth: ["previous month", "mês anterior"],
  nextMonth: ["next month", "próximo mês"],
  closeDatePicker: ["close calendar", "fechar calendário"],
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
  priorityLabel: ["Priority", "Prioridade"],
  priorityNone: ["none", "nenhuma"],
  priorityHigh: ["high", "alta"],
  priorityMedium: ["medium", "média"],
  priorityLow: ["low", "baixa"],
  repeatLabel: ["Repeat", "Repetir"],
  remindLabel: ["Remind me", "Lembrar"],
  addReminder: ["add reminder", "adicionar lembrete"],
  clearReminder: ["clear reminder", "limpar lembrete"],
  clearReminderHint: ["clear", "limpar"],
  remindLaterToday: ["Later today", "Mais tarde hoje"],
  remindTomorrow: ["Tomorrow", "Amanhã"],
  remindNextWeek: ["Next week", "Semana que vem"],
  remindDayBefore: ["The day before", "Na véspera"],
  remindOnDue: ["On the due date", "No dia do prazo"],
  remindPick: ["Pick date and time…", "Escolher data e hora…"],
  remindTimeLabel: ["reminder time", "hora do lembrete"],
  remindDateLabel: ["reminder date", "data do lembrete"],
  reminderDue: [(date) => `due ${date}`, (date) => `para ${date}`],
  reminderAt: [(moment) => `Reminder: ${moment}`, (moment) => `Lembrete: ${moment}`],
  reminderNotShown: [
    (texts) =>
      `${texts.length === 1 ? "A reminder" : `${texts.length} reminders`} could not be shown as a notification: ${texts.join(" · ")}`,
    (texts) =>
      `${texts.length === 1 ? "Um lembrete não pôde" : `${texts.length} lembretes não puderam`} ser mostrado${texts.length === 1 ? "" : "s"} como notificação: ${texts.join(" · ")}`,
  ],
  dayNoticeTitle: [
    (n) => (n === 1 ? "You have 1 task today" : `You have ${n} tasks today`),
    (n) => (n === 1 ? "Você tem 1 tarefa hoje" : `Você tem ${n} tarefas hoje`),
  ],
  dayNoticeMore: [
    (n) => (n === 1 ? "…and 1 more" : `…and ${n} more`),
    (n) => (n === 1 ? "…e mais 1" : `…e mais ${n}`),
  ],
  dayNoticePlanned: [
    (n) =>
      n === 1 ? "You have 1 task planned for today" : `You have ${n} tasks planned for today`,
    (n) =>
      n === 1 ? "Você tem 1 tarefa planejada para hoje" : `Você tem ${n} tarefas planejadas para hoje`,
  ],
  dayNoticeFirstReminder: [
    (time) => `First reminder at ${time}`,
    (time) => `Primeiro lembrete às ${time}`,
  ],
  notifyDone: ["Done", "Concluir"],
  notifyLater: ["Later", "Depois"],
  notifyTomorrow: ["Tomorrow", "Amanhã"],
  notifyChannelReminders: ["Reminders", "Lembretes"],
  notifyChannelSummary: ["Day summary", "Resumo do dia"],
  repeatEvery: ["every", "a cada"],
  noRepeat: ["never", "nunca"],
  repeatFreely: ["freely", "livremente"],
  repeatDays: ["day", "dia"],
  repeatWeeks: ["week", "semana"],
  repeatMonths: ["month", "mês"],

  // Notebook-wide search
  findTitle: ["Search", "Buscar"],
  findPlaceholder: ["Search tasks and notes…", "Buscar tarefas e notas…"],
  findNothing: [
    (query) => `Nothing found for “${query}”.`,
    (query) => `Nada encontrado para “${query}”.`,
  ],
  findTasks: ["Tasks", "Tarefas"],
  findNotes: ["Notes", "Notas"],
  findMore: [
    "Showing the first matches only — narrow the search to see the rest.",
    "Mostrando só os primeiros resultados — refine a busca para ver o resto.",
  ],
  findDone: ["completed", "concluída"],
  findClear: ["clear search", "limpar busca"],
  findIn: [(place) => `Search in ${place}…`, (place) => `Buscar em ${place}…`],
  findNothingIn: [
    (query, place) => `Nothing found for “${query}” in ${place}.`,
    (query, place) => `Nada encontrado para “${query}” em ${place}.`,
  ],

  // The page ⋮ and the canvas right-click menu
  renameThisSpace: ["Rename space", "Renomear space"],
  openInFileManager: ["Open in file manager", "Abrir no gerenciador de arquivos"],
  findInPlace: [(place) => `Find in ${place}`, (place) => `Buscar em ${place}`],
  findInNote: ["Find in note", "Buscar na nota"],
  replaceInNote: ["Replace in note", "Substituir na nota"],
  thisNotebook: ["this notebook", "este caderno"],

  // The sidebar head
  search: ["search", "buscar"],
  newEntry: ["new list, notepad or group", "nova lista, bloco de notas ou grupo"],
  resizeSidebar: ["resize sidebar", "redimensionar barra lateral"],
  resizePanel: ["resize panel", "redimensionar painel"],
  sidebarWidthValue: [
    (px) => `sidebar width: ${px} pixels`,
    (px) => `largura da barra lateral: ${px} pixels`,
  ],

  // The file library
  assetsTitle: ["Files", "Arquivos"],
  assetsHint: [
    "Every file you add lives in the notebook's assets folder. Notes and tasks " +
      "point at it by address, so moving them never breaks a link.",
    "Todo arquivo que você adiciona fica na pasta assets do caderno. Notas e tarefas " +
      "apontam para ele pelo endereço, então movê-las nunca quebra um link.",
  ],
  assetsEmpty: ["No files yet.", "Nenhum arquivo ainda."],
  addImages: ["Add files", "Adicionar arquivos"],
  addingImages: ["Adding…", "Adicionando…"],
  copyAddress: ["Copy address", "Copiar endereço"],
  addressCopied: ["Address copied", "Endereço copiado"],
  deleteImage: ["Delete file", "Excluir arquivo"],
  confirmDeleteAsset: [
    (name) =>
      `Delete "${name}"? It goes to the trash, and whatever points at it will point at nothing.`,
    (name) =>
      `Excluir “${name}”? Ele vai para a lixeira, e o que aponta para ele vai apontar para o nada.`,
  ],
  imageCount: [
    (n) => (n === 1 ? "1 file" : `${n} files`),
    (n) => (n === 1 ? "1 arquivo" : `${n} arquivos`),
  ],
  imageSize: [
    (kb) => (kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`),
    (kb) => (kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1).replace(".", ",")} MB`),
  ],
  missingImage: ["image not found", "imagem não encontrada"],
  ageDays: [
    (days) => (days === 0 ? "today" : `${days}d`),
    (days) => (days === 0 ? "hoje" : `${days}d`),
  ],
  lastSeenOn: [(date) => `Last opened ${date}`, (date) => `Aberta pela última vez em ${date}`],
  createdLabel: ["Created", "Criada"],
  neverOpened: ["Never opened in Jott", "Nunca aberta no Jott"],
  createdOn: [(date) => `Created ${date}`, (date) => `Criada em ${date}`],
  chooseImageOnly: [
    "Only an image can be a banner or go inside a note.",
    "Só uma imagem pode ser banner ou ir dentro de uma nota.",
  ],
  openFile: ["Open file", "Abrir arquivo"],
  removeAttachment: ["Remove attachment", "Remover anexo"],

  // The note's banner
  banner: ["Banner", "Banner"],
  bannerColor: ["Colour", "Cor"],
  noteHead: ["Title and banner", "Título e banner"],
  noteTitleField: ["Title", "Título"],
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
  bannerImage: ["Choose image…", "Escolher imagem…"],
  removeBanner: ["Remove banner", "Remover banner"],
  chooseImage: ["Choose an image", "Escolha uma imagem"],
  chooseFile: ["Choose a file", "Escolha um arquivo"],
  insertImage: ["Insert image…", "Inserir imagem…"],
  noteNotFound: [
    (title) => `No note called “${title}”.`,
    (title) => `Nenhuma nota chamada “${title}”.`,
  ],

  // A drag or a paste that declared a file and carried none
  noFileInGesture: [
    (types) =>
      `Nothing could be read from that${types.length ? ` (${types.join(", ")})` : ""}.`,
    (types) =>
      `Nada pôde ser lido disso${types.length ? ` (${types.join(", ")})` : ""}.`,
  ],

  // Deleting, in the app's own dialog
  deleteAction: ["Delete", "Excluir"],
  dontAskAgain: ["Don’t ask again", "Não perguntar de novo"],
  goesToTrash: [
    "It goes to the trash, and can be restored from there.",
    "Vai para a lixeira, e pode ser restaurado.",
  ],
  assetInUseWarning: [
    (n) =>
      n === 1
        ? "One note or task is showing this file. That link will stop working."
        : `${n} notes and tasks are showing this file. Those links will stop working.`,
    (n) =>
      n === 1
        ? "Uma nota ou tarefa mostra este arquivo. Esse link vai parar de funcionar."
        : `${n} notas e tarefas mostram este arquivo. Esses links vão parar de funcionar.`,
  ],

  // Fetching a picture from the internet
  downloadImageTitle: ["Download this picture?", "Baixar esta imagem?"],
  downloadImageBody: [
    "This picture is not on your computer. To put it in the note, Jott has to fetch it from:",
    "Esta imagem não está no seu computador. Para colocá-la na nota, o Jott precisa buscá-la em:",
  ],
  downloadImageConfirm: ["Download", "Baixar"],
  renameFile: ["Rename", "Renomear"],
  promptRenameFile: [(name) => `Rename “${name}”`, (name) => `Renomear “${name}”`],
  assetUnused: ["Not used", "Não usado"],
  assetUsedIn: [
    (n) => (n === 1 ? "Used in 1 place" : `Used in ${n} places`),
    (n) => (n === 1 ? "Usado em 1 lugar" : `Usado em ${n} lugares`),
  ],
  assetGoTo: [(title) => `Go to “${title}”`, (title) => `Ir para “${title}”`],

  // Picking notes on the board, the way tasks are picked
  selectNotes: ["Reorder notes…", "Reordenar notas…"],
  moveNotesTo: ["Move to…", "Mover para…"],
  notesFolderCount: [
    (n) => (n === 1 ? "1 note" : `${n} notes`),
    (n) => (n === 1 ? "1 nota" : `${n} notas`),
  ],
  openFolder: [(name) => `open ${name}`, (name) => `abrir ${name}`],
  backToBoard: ["Back", "Voltar"],
  noteOptions: ["note options", "opções da nota"],

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
