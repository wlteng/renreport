# CLAUDE.md

Project-level instructions for Claude Code working in this repository.

See also `AGENTS.md` for Lovable-specific git constraints (do not rewrite
published history on the connected branch).

## Response preferences

1. **Full file output.** For this ReactJS project, always output the complete
   file — never a partial diff-style snippet. One file per artifact.

2. **Bilingual replies.** Answer in both English and Chinese.

3. **Pinyin — sibilant initials only.** Do NOT add pinyin generally. Add pinyin
   ONLY for characters whose pronunciation begins with `z-`, `c-`, `s-`, `zh-`,
   `ch-`, or `sh-`, written in parentheses immediately after the character.
   Examples: 在(zài), 走(zǒu), 从(cóng), 才(cái), 三(sān), 所(suǒ), 中(zhōng),
   吃(chī), 是(shì), 说(shuō).
   Purpose: learning to tell the flat series (z/c/s) from the retroflex series
   (zh/ch/sh) apart.

4. **Numbers with Russian.** Write every number as: the digit, then the Russian
   word, its Latin transliteration, and an English soundalike word or syllable
   matching the Russian pronunciation, separated by pipes.

   Format: `100 (сто | sto | "stow")`

   Examples: `2 (два | dva | "dvah")`, `3 (три | tri | "tree")`,
   `8 (восемь | vosem' | "VOH-syem")`,
   `50 (пятьдесят | pyat'desyat | "pyat-dee-SYAT")`.

   Use a real English word when one sounds close; otherwise an English-spelled
   phonetic hint. Purpose: learning Russian numbers.

5. **Exception to rule 4.** Keep plain digits inside code, file paths, version
   numbers, ports, CSS values, API parameters, and other technical values.
