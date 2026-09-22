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
  unpinTask: ["Unpin", "Desafixar"],
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
      "It only happens on screen: the .md file keeps every word whole. Needs " +
      "the system's hyphenation rules for the app's language — where they are " +
      "missing, nothing changes.",
    "Quebra uma palavra longa em duas linhas para a margem direita parar de " +
      "pular. Só acontece na tela: o arquivo .md guarda cada palavra inteira. " +
      "Precisa das regras de hifenização do sistema para o idioma do app — onde " +
      "elas faltam, nada muda.",
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
  formatLists: ["List", "Lista"],
  formatInsert: ["Insert", "Inserir"],

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

  // Task row and inspector
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

  // The note's banner
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
