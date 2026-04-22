# AI Providers

Kaisho supports multiple AI providers. Configure them in
**Settings > AI** or directly in `settings.yaml`.

## Provider Overview

| Provider | Prefix | Local/Cloud | Tool Calling |
|----------|--------|-------------|--------------|
| Ollama | `ollama:` | Local | Yes |
| Ollama Cloud | `ollama_cloud:` | Cloud | Yes |
| LM Studio | `lm_studio:` | Local | Yes |
| Claude (Anthropic) | `claude:` | Cloud | Yes |
| OpenAI | `openai:` | Cloud | Yes |
| OpenRouter | `openrouter:` | Cloud | Yes |
| Kaisho Cloud AI | `kaisho:` | Cloud | Yes |

## Ollama (Local)

Run models on your own hardware. Install
[Ollama](https://ollama.com), then:

```yaml
# settings.yaml
ollama_url: http://localhost:11434
advisor_model: ollama:qwen3:14b
```

The UI auto-discovers available models from your Ollama instance.

## Ollama Cloud

Use Ollama's hosted inference. Get an API key from
[ollama.com](https://ollama.com).

```yaml
ollama_cloud_url: https://ollama.com
ollama_api_key: your-api-key-here
advisor_model: ollama_cloud:gemma4:31b
```

!!! note
    Some models require a paid Ollama subscription. Free-tier models
    include `gemma3:27b`, `gemma4:31b`, `qwen3-next:80b`,
    `deepseek-v3.2`, and others. Check the Ollama Cloud dashboard
    for current availability.

## LM Studio

Run models through [LM Studio](https://lmstudio.ai):

```yaml
lm_studio_url: http://localhost:1234
advisor_model: lm_studio:your-model-name
```

## Claude (Anthropic)

Use Anthropic's API directly. Get an API key from
[console.anthropic.com](https://console.anthropic.com):

```yaml
claude_api_key: sk-ant-...
advisor_model: claude:claude-sonnet-4-20250514
```

!!! warning
    This requires a pay-per-use API key, not a Claude Pro consumer
    subscription. API and consumer accounts are separate.

## OpenAI

```yaml
openai_url: https://api.openai.com
openai_api_key: sk-...
advisor_model: openai:gpt-4o
```

## OpenRouter

Access hundreds of models through a single API key from
[openrouter.ai](https://openrouter.ai):

```yaml
openrouter_url: https://openrouter.ai/api/v1
openrouter_api_key: sk-or-...
advisor_model: openrouter:anthropic/claude-sonnet-4
```

## Kaisho Cloud AI

When connected to Kaisho Cloud with a `sync_ai` plan, the advisor
can use the hosted AI gateway. No API keys needed:

```yaml
# Automatically configured when Cloud Sync is connected
advisor_model: kaisho:default
```

## Separate Models for Advisor and Cron

You can use different models for interactive advisor queries and
background cron jobs:

```yaml
advisor_model: ollama_cloud:gemma4:31b
cron_model: ollama:gemma4:latest
```

This lets you use a cloud model for the advisor (better quality) and
a local model for cron jobs (no API costs).

## Checking Provider Status

In **Settings > AI**, the probe indicator shows which providers are
reachable. Green means the provider responded; red means it's
unreachable or the key is invalid.
