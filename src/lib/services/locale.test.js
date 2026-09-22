import { describe, expect, test } from "vitest";

import { S } from "./strings.js";
import { apply } from "./locale.js";
import { LANGUAGES, audit } from "../locales/index.js";

// Every shipped dictionary against the source table. The hard cases fail:
// an orphan is a rename that forgot the dictionary; a malformed entry never
// applies; a function or table whose English moved on is applied on trust
// and would show the OLD meaning. A stale string and a missing key only
// report — the app shows English there by itself (`npm run i18n` lists them).
describe.each(Object.entries(LANGUAGES).filter(([, l]) => l.load))(
  "the %s dictionary",
  (tag, { load }) => {
    test("names only keys the source has, as pairs of the same shape", async () => {
      const { orphans, malformed, broken, stale, missing, covered, total } = audit(
        S,
        (await load()).default,
      );
      expect(orphans).toEqual([]);
      expect(malformed).toEqual([]);
      expect(broken).toEqual([]);
      if (stale.length) console.info(`[i18n] ${tag}: English moved on for ${stale.join(", ")}`);
      console.info(`[i18n] ${tag}: ${covered}/${total} keys, ${missing.length} missing`);
    });
  },
);

describe("apply", () => {
  test("lays a dictionary over S, by every shape a string takes", async () => {
    apply((await LANGUAGES["pt-BR"].load()).default);
    expect(S.today).toBe("Hoje");
    expect(S.confirmDeleteTasks(2)).toBe("Excluir 2 tarefas?");
    expect(S.ago({ unit: "hour", count: 3 })).toBe("há 3 horas");
    expect(S.months[0]).toBe("Janeiro");
    expect(S.shortcutScope("editor")).toBe("Escrevendo uma nota");
    // A key the dictionary does not name stays English.
    expect(S.completed).toBe("Completed");
  });

  test("a pair whose English is not the source's is left alone", () => {
    apply({
      completed: ["Finished", "Concluídas"],
      actionNames: [{ create_task: "Add task" }, { create_task: "Adicionar tarefa" }],
      notAKeyOfS: ["Anything", "Qualquer coisa"],
      menu: "not a pair",
    });
    expect(S.completed).toBe("Completed");
    expect(S.actionNames.create_task).toBe("New task");
    expect("notAKeyOfS" in S).toBe(false);
    expect(S.menu).toBe("menu");
  });

  test("a translated table reaches the functions that read it", () => {
    apply({ actionNames: [S.actionNames, { ...S.actionNames, create_task: "Nova tarefa" }] });
    expect(S.actionName("create_task")).toBe("Nova tarefa");
    expect(S.undoOfferText("create_task")).toBe("Nova tarefa");
  });
});
