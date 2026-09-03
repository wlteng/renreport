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
   Examples: 走(zǒu), 从(cóng), 才(cái), 所(suǒ), 中(zhōng), 时(shí), 次(cì),
   只(zhǐ), 出(chū), 早(zǎo).

   Purpose: learning to tell the flat series (z/c/s) from the retroflex series
   (zh/ch/sh) apart.

   **Excluded — already learned, never annotate these:** 是, 这, 三, 吃, 事,
   说, 在.

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

6. **Russian vocabulary annotation.** When one of the words below appears in an
   English reply, annotate it inline as: `english (русский | translit)`.

   Example: `Please accept (принять | prinyat') the terms.`

   Annotate the first occurrence in a reply; repeats in the same reply may be
   left plain. This rule runs alongside rules 3 and 4, not instead of them.
   Rule 5's technical-value exception applies here too: never annotate a word
   that is part of code, a file path, an identifier, or a UI string being
   written into the codebase.

   **Core short words**

   | English | Russian | Translit |
   |---|---|---|
   | and | и | i |
   | in | в | v |
   | not | не | ne |
   | but | но | no |
   | I | я | ya |
   | he | он | on |
   | we | мы | my |
   | you | ты | ty |
   | this | это | eto |
   | all | все | vse |
   | who | кто | kto |
   | how | как | kak |
   | where | где | gde |
   | when | когда | kogda |
   | now | сейчас | seychas |
   | yes | да | da |
   | no | нет | net |
   | good | хорошо | khorosho |
   | can | могу | mogu |
   | want | хочу | khochu |

   **App UI and navigation**

   | English | Russian | Translit |
   |---|---|---|
   | accept | принять | prinyat' |
   | cancel | отмена | otmena |
   | ok | ок | ok |
   | confirm | подтвердить | podtverdit' |
   | save | сохранить | sokhranit' |
   | delete | удалить | udalit' |
   | edit | редактировать | redaktirovat' |
   | search | поиск | poisk |
   | back | назад | nazad |
   | next | далее | dalee |
   | submit / send | отправить | otpravit' |
   | account | аккаунт | akkaunt |
   | profile | профиль | profil' |
   | home page | главная | glavnaya |
   | about us | о нас | o nas |
   | settings | настройки | nastroyki |
   | log in | войти | voyti |
   | log out | выйти | vyyti |
   | sign up | регистрация | registratsiya |
   | help / support | помощь | pomoshch' |
   | contact | контакт | kontakt |
   | terms | условия | usloviya |
   | privacy | конфиденциальность | konfidentsial'nost' |

   **Personal info form fields**

   | English | Russian | Translit |
   |---|---|---|
   | name | имя | imya |
   | surname | фамилия | familiya |
   | password | пароль | parol' |
   | email | почта | pochta |
   | phone | телефон | telefon |
   | address | адрес | adres |
   | city | город | gorod |
   | country | страна | strana |
   | date of birth | дата рождения | data rozhdeniya |
   | gender | пол | pol |

   **Payment and checkout**

   | English | Russian | Translit |
   |---|---|---|
   | payment | оплата | oplata |
   | card | карта | karta |
   | price | цена | tsena |
   | total | итого | itogo |
   | order | заказ | zakaz |
   | cart | корзина | korzina |
   | delivery | доставка | dostavka |
