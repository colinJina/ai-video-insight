# Retrieval Eval Plan

This planning sheet is built from real analyses currently stored in Supabase.
Use it to expand `scripts/my-retrieval-eval.json` into a larger evaluation set.

## Analysis A

- `analysisId`: `47f10f32-0f3f-47f2-bd08-fb676aa558d3`
- `userId`: `870b34b8-15be-40ec-9921-8193081c0c99`
- `title`: `杨医生与阿祖鱼油事件讨论`
- `chunkCount`: `9`

### Chunk Map

| Chunk | Time Range | Notes |
| --- | --- | --- |
| `0` | `00:00 - 00:59` | 杨医生开场，直接下结论：保健品鱼油是智商税。 |
| `1` | `00:00 - 04:04` | `0` 的扩展版，包含“食补优于补剂”“处方级鱼油”等论证。 |
| `2` | `00:59 - 04:04` | 阿祖开始回应，强调自己与杨医生并非完全对立。 |
| `3` | `00:59 - 08:02` | `2` 的扩展版，覆盖阿祖前半段完整反驳。 |
| `4` | `04:05 - 08:02` | 杨医生继续反驳，强调吃不到深海鱼就想办法吃食物。 |
| `5` | `04:05 - 10:17` | `4` 的扩展版，覆盖杨医生后半段完整反驳。 |
| `6` | `08:07 - 10:17` | 阿祖最后回应，强调食品级鱼油也可以作为选择。 |
| `7` | `08:07 - 11:25` | `6` 的扩展版，覆盖阿祖完整收尾观点。 |
| `8` | `10:17 - 11:25` | 杨医生呼吁理性讨论，反对网暴和人身攻击。 |

### Planned Questions

| ID | Query | Expected Chunk Indexes | Metadata Filter | Why These Chunks |
| --- | --- | --- | --- | --- |
| `fishoil-opening-claim` | 杨医生开头对保健品鱼油下了什么结论？ | `[0]` | `0-60s` optional | 开场明确结论就在 `chunk 0`。 |
| `fishoil-prescription-vs-supplement` | 杨医生为什么说保健品鱼油不能替代处方级鱼油？ | `[0,1]` | none | `chunk 0/1` 承担“降血脂有限、处方级纯度更高”这段核心论证。 |
| `fishoil-food-vs-supplement` | 视频里为什么反复强调食补优于保健品？ | `[1,4,5]` | none | 杨医生在 `1` 首次提出，`4/5` 又进一步展开。 |
| `fishoil-azu-position` | 阿祖的核心观点是什么？ | `[2,3]` | `59-482s` optional | 阿祖从 `2/3` 开始阐述“低纯度鱼油才是智商税”。 |
| `fishoil-disagreement` | 阿祖和杨医生真正分歧在哪里？ | `[2,3,4,5]` | none | 分歧跨双方论证，建议允许两侧 chunk。 |
| `fishoil-target-users` | 视频里提到鱼油不适合哪些人群？ | `[5]` | `245-618s` optional | 这部分在杨医生后段反驳里更完整。 |
| `fishoil-deep-sea-fish` | 为什么杨医生说吃不到深海鱼就想办法通过食物补充？ | `[4,5]` | `245-618s` optional | 食补、罐头、成本论证集中在 `4/5`。 |
| `fishoil-azu-final-response` | 阿祖最后为什么认为食品级鱼油仍然可以作为一种选择？ | `[6,7]` | `487-685s` optional | 这段是阿祖最后的完整回应。 |
| `fishoil-no-false-advertising` | 阿祖如何为自己没有虚假宣传做辩护？ | `[6,7]` | `487-685s` optional | 相关表述集中在 `6/7`。 |
| `fishoil-rational-discussion` | 杨医生最后呼吁大家如何讨论这场争议？ | `[8]` | `617-686s` optional | 收尾观点在 `chunk 8` 最集中。 |
| `fishoil-no-personal-attack` | 视频为什么反对网暴和人身攻击？ | `[8]` | `617-686s` optional | `chunk 8` 明确讲到“对事不对人”。 |
| `fishoil-outline-middle` | 视频中段主要围绕哪些论点继续反驳鱼油营销？ | `[4,5]` | `245-618s` optional | 中段主论证在 `4/5`。 |

## Analysis B

- `analysisId`: `51a16179-b355-45c7-b437-c82221d7b270`
- `userId`: `870b34b8-15be-40ec-9921-8193081c0c99`
- `title`: `Misleading Marketing Tactics of Certain Fish Oil Brands`
- `chunkCount`: `4`

### Chunk Map

| Chunk | Time Range | Notes |
| --- | --- | --- |
| `0` | `00:00 - 01:27` | 事件起因，直播间挪用视频并出现误导性说法。 |
| `1` | `00:30 - 01:27` | 主播关于 Omega-3 来源和日常饮食的错误说法。 |
| `2` | `00:30 - 07:00` | `1` 的扩展版，覆盖更多直播间错误宣传。 |
| `3` | `01:27 - 07:00` | 对 Omega-6、功效宣传和法规问题的集中反驳。 |

### Planned Questions

| ID | Query | Expected Chunk Indexes | Metadata Filter | Why These Chunks |
| --- | --- | --- | --- | --- |
| `mislead-origin` | 这场鱼油宣传争议的起因是什么？ | `[0]` | `0-90s` optional | 事件背景主要在 `chunk 0`。 |
| `mislead-omega3-claim` | 直播间对 Omega-3 做了哪些误导性表述？ | `[1,2]` | `30-420s` optional | 主播说法集中在 `1/2`。 |
| `mislead-food-sources` | 视频如何反驳“日常饮食吃不到 Omega-3”这种说法？ | `[1,2]` | none | 反驳重点在 `1/2`。 |
| `mislead-omega6` | 视频为什么说把 Omega-6 说成完全不需要是不科学的？ | `[3]` | `87-420s` optional | 对 Omega-6 的批评集中在 `3`。 |
| `mislead-effect-claims` | 主播宣传鱼油时夸大了哪些功效？ | `[3]` | `87-420s` optional | “代谢提高、记忆力变好”等都在 `3`。 |
| `mislead-regulation` | 视频最后对这种宣传方式的监管和合规问题有什么态度？ | `[3]` | `87-420s` optional | 法规与合规态度主要在 `3`。 |

## Recommended Build Order

1. First convert the 6 questions from Analysis B into JSON.
2. Then add 6 questions from Analysis A.
3. Run the eval script.
4. Trim any question whose gold chunks feel too broad.
5. Expand from 12 to 15-20 questions only after the first run is stable.

## Notes For Labeling

- Prefer `1-2` expected chunks per question.
- Use `3-4` chunks only for true comparison questions that span both speakers.
- Overlap chunks exist in Analysis A, so `[0,1]`, `[2,3]`, `[4,5]`, `[6,7]` are normal.
- If a question is really asking about a time slice such as “开头” or “结尾”, add a `metadataFilter`.
