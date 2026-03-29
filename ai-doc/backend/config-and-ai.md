# Backend Config And AI

Last verified: 2026-03-25

## Scope

1. Covers platform config registration, config read/write routes, AI config defaults, and R2 upload config.
2. Service-specific business usage of config should still be documented in service or domain docs.

## Config foundation

1. Platform creates `xstorage.CfgExt` during `PlatForm.Init`.
2. Registered config params are added in `PlatForm.InitCfg()`.
3. Config values are persisted through platform storage, not hardcoded in frontend.
4. Config routes expose filtered reads/writes on top of `CfgExt`.

## Config route surface

1. Platform config:
   - `POST /cfg/plat/set`
   - `POST /cfg/plat/get`
2. Service config:
   - `POST /cfg/:svr/set`
   - `POST /cfg/:svr/get`
3. User-scoped service config:
   - `POST /cfg/:svr/:user/set`
   - `POST /cfg/:svr/:user/get`

## Config permission model

1. `POST /cfg/plat/*` requires:
   - `admin`, or
   - `plat.cfg`
2. `POST /cfg/:svr/*` requires one of:
   - `admin`
   - service permission itself (for example `todone`)
   - service cfg permission string (for example `<svr>.cfg`)
3. `POST /cfg/:svr/:user/*` currently has no explicit permission check in gateway code.
4. Because user-scoped config routes are looser than platform/service routes, changes there should be reviewed carefully before reuse.

## Registered platform keys

1. Core platform keys registered in `PlatForm.InitCfg()`:
   - `note.setting`
   - `PLAT.realUrl`
   - `PLAT.outUrl`
   - `PLAT.baseUrl`
   - `auto.news.keys`
   - `PLAT.r2.endpoint`
   - `PLAT.r2.accessKey`
   - `PLAT.r2.secretKey`
   - `PLAT.r2.bucket`
   - `PLAT.r2.web`
2. AI keys are appended by `share.DefaultAIConfigParams()`:
   - `PLAT.openai.base`
   - `PLAT.openai.token`
   - `PLAT.openai.model.cheap`
   - `PLAT.openai.model.fast`
   - `PLAT.openai.model.normal`
   - `PLAT.openai.scene.rewrite`
   - `PLAT.openai.scene.summary`
   - `PLAT.openai.scene.translate`

## AI config defaults

1. Default model pools are:
   - `cheap`: `gpt-5.4-mini`, `gpt-5.4-nano`
   - `fast`: `gpt-5-chat-latest`
   - `normal`: `gpt-5.4`, `gpt-5-chat-latest`
2. Default scene-to-mode mapping is:
   - `rewrite -> fast`
   - `summary -> cheap`
   - `translate -> cheap`
3. Default placeholder values for `PLAT.openai.base` and `PLAT.openai.token` are `need input`.
4. The reusable AI wrapper in `backend/mian_go_lib/tool/ai/openai.go` now uses the official Go SDK `github.com/openai/openai-go/v3`.
5. The wrapper still sends requests through the Chat Completions API for compatibility with existing callers and OpenAI-compatible base URLs.

## AI rewrite endpoint

1. Endpoint: `POST /misc/gpt-rewrite`
2. Required permission:
   - `gpt`, or
   - `admin`
3. Input payload:
   - `content`
4. Runtime steps:
   - load AI config from `CfgExt`
   - validate base/token presence
   - choose mode for `rewrite` scene
   - initialize OpenAI client with configured model pools
   - send rewrite prompt and return rewritten content
5. Common failure signatures:
   - `no permission`
   - `openai config error`
   - `openai.base is empty`
   - `openai.token is empty`
   - `openai init error`
   - `svr error`

## Config read behavior in admin flows

1. Config reads use `GetWithFilter`.
2. Platform/service config responses can surface registered defaults before the first explicit save.
3. This is why admin UI can read AI config defaults even when nothing has been saved yet.

## R2 config and upload contract

1. Upload endpoint: `POST /misc/r2-presigned-url`
2. Required permission:
   - `file`, or
   - `admin`
3. Request payload:
   - `fileName`
   - `fileType`
4. Required config keys:
   - `PLAT.r2.endpoint`
   - `PLAT.r2.accessKey`
   - `PLAT.r2.secretKey`
   - `PLAT.r2.bucket`
   - `PLAT.r2.web`
5. Generated object key format:
   - `uploads/<year>/<month>/<day>/<user>/<uuid>/<fileName>`
6. Response payload returns:
   - `UploadURL`
   - `PublicURL`
7. Presigned PUT URL expiry is 15 minutes.
8. Common failure signatures:
   - `no permission`
   - `r2 config error`
   - `r2 params invalid`

## Loading guidance

1. Load this file when the task touches:
   - config defaults or writes
   - admin setting pages
   - AI rewrite behavior
   - R2 upload setup
   - platform/service/user config boundaries
