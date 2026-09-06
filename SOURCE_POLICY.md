# Source Integrity Policy — Protestant Study Edition

## Non-negotiable project rule

The Bible-study system only accepts theological, exegetical, lexical and Scripture-reference resources that have been verified as legitimate mainstream Protestant / evangelical sources suitable for this project.

### Explicitly excluded by project policy

- Jehovah's Witnesses / Watch Tower sources
- Mormon / LDS sources
- Roman Catholic doctrinal, commentary, catechetical or study-Bible sources
- Sources affiliated with groups the project has excluded as cults
- Anonymous or unclear-provenance theological material
- AI-generated claims presented as if they were an external authority

When provenance cannot be confirmed, the source is rejected until reviewed.

## Approved source families for the current foundation

### Scripture
- **Chinese Union Version — Simplified (新标点和合本 / CUVS)**: the project-owner supplied edition states Public Domain.
- **New King James Version (NKJV)**: user-supplied reference text for the private prototype. Public/commercial redistribution requires separate rights review with Thomas Nelson.

### Original languages / lexical study
- **STEP Bible / Tyndale House** — preferred original-language reference family. Tyndale House explicitly defines its charitable purpose around evangelical Christian religion and evangelical biblical scholarship.
- **Blue Letter Bible** — secondary verification for lexical/study data; it states that its selected pastors and teachers hold to the conservative, historical Christian faith.

### Cross references
- **Treasury of Scripture Knowledge (TSK)** — primary Scripture-to-Scripture cross-reference dataset. Cross references are reference links, not a replacement for Scripture.

### Evangelical study verification
- **Bible.org / NET Bible** — Bible.org describes itself as broadly evangelical and publishes a doctrinal statement affirming Scripture as inspired/inerrant authority, the Trinity, Christ's substitutionary death and salvation through faith.

### Geography / archaeology / photo-reference discovery
- **BiblePlaces.com** — founded by Todd Bolen; his academic background includes The Master's Seminary and Dallas Theological Seminary, and he serves in Biblical Studies at The Master's University. Images are not bundled without permission.

### Technical distribution only
- **eBible.org CUVS listing** may be used to confirm public-domain CUVS editions/formats.
- A neutral code repository may transport the exact CUVS public-domain text **only as technical infrastructure**. It is never treated as a theological source, and no commentary from it is imported.

## Required source labels in the application

Every non-user data object should be attributable to one of these layers:

- `SCRIPTURE`
- `ORIGINAL LANGUAGE`
- `CROSS REFERENCE`
- `HISTORICAL / GEOGRAPHY`
- `COMMENTARY`
- `USER`
- `AI` (future; always visibly labelled)

## Interpretive safeguards

1. Scripture is displayed separately from all notes.
2. A historical claim is not promoted to a doctrinal claim.
3. Disputed chronology is marked approximate/debated.
4. Traditional interpretation is not labelled “the Bible says” unless the text itself states it.
5. When Protestant interpreters differ on a non-essential issue, future commentary should label the different Protestant viewpoints rather than conceal disagreement.
6. The provenance check happens before content enters the production knowledge base.
