import { Router } from 'express'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export const toolsRouter = Router()

const HERMES_TOOLS_PATH = join(process.env.HOME || '', '.hermes', 'hermes-agent', 'toolsets.py')

// Toolset metadata — synced with real `hermes tools list` output
// Note: individual tool names (tools[]) are informative only; the Hermes CLI
// does not expose per-tool names at the toolsets level. Toggling is per-toolset.
const TOOLSETS = {
  web: {
    label: 'Web Search & Scraping',
    description: 'Search the web and extract content from pages',
    tools: ['web_search', 'web_extract'],
    configured: true,
  },
  browser: {
    label: 'Browser Automation',
    description: 'Control a headless browser with Playwright',
    tools: ['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type', 'browser_scroll', 'browser_back', 'browser_press', 'browser_get_images', 'browser_vision', 'browser_console'],
    configured: true,
  },
  terminal: {
    label: 'Terminal & Processes',
    description: 'Run shell commands and manage processes',
    tools: ['terminal', 'process'],
    configured: true,
  },
  file: {
    label: 'File Operations',
    description: 'Read, write, search, and patch files',
    tools: ['read_file', 'write_file', 'patch', 'search_files'],
    configured: true,
  },
  code_execution: {
    label: 'Code Execution',
    description: 'Execute Python code in a sandboxed environment',
    tools: ['execute_code'],
    configured: true,
  },
  vision: {
    label: 'Vision / Image Analysis',
    description: 'Analyze images using AI vision models',
    tools: ['vision_analyze'],
    configured: true,
  },
  image_gen: {
    label: 'Image Generation',
    description: 'Generate images from text prompts',
    tools: ['image_generate'],
    configured: true,
  },
  moa: {
    label: 'Mixture of Agents',
    description: 'Multi-agent reasoning with MoA architecture',
    tools: ['mixture_of_agents'],
    configured: true,
  },
  tts: {
    label: 'Text-to-Speech',
    description: 'Convert text to speech audio',
    tools: ['text_to_speech'],
    configured: true,
  },
  skills: {
    label: 'Skills',
    description: 'Manage and invoke skills from agentskills.io',
    tools: ['skills_list', 'skill_view', 'skill_manage'],
    configured: true,
  },
  todo: {
    label: 'Task Planning',
    description: 'Manage a persistent task list',
    tools: ['todo'],
    configured: true,
  },
  memory: {
    label: 'Memory',
    description: 'Store and retrieve persistent memories',
    tools: ['memory'],
    configured: true,
  },
  session_search: {
    label: 'Session Search',
    description: 'Search across past conversation sessions',
    tools: ['session_search'],
    configured: true,
  },
  clarify: {
    label: 'Clarifying Questions',
    description: 'Ask the user for clarification or confirmation',
    tools: ['clarify'],
    configured: true,
  },
  delegation: {
    label: 'Task Delegation',
    description: 'Spawn independent sub-agents for parallel tasks',
    tools: ['delegate_task'],
    configured: true,
  },
  cronjob: {
    label: 'Cron Jobs',
    description: 'Create and manage cron-style scheduled tasks',
    tools: ['cronjob'],
    configured: true,
  },
  rl: {
    label: 'RL Training',
    description: 'Reinforcement learning environment interaction and training',
    tools: ['rl_list_environments', 'rl_select_environment', 'rl_get_current_config', 'rl_edit_config', 'rl_start_training', 'rl_check_status', 'rl_stop_training', 'rl_get_results', 'rl_list_runs', 'rl_test_inference'],
    configured: true,
  },
  homeassistant: {
    label: 'Home Assistant',
    description: 'Control smart home devices via Home Assistant',
    tools: ['ha_list_entities', 'ha_get_state', 'ha_list_services', 'ha_call_service'],
    configured: true,
  },
}

// Parse hermes tools list output to get runtime enabled/disabled state
function parseToolsList() {
  try {
    const output = execSync('hermes tools list', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    })

    const toolsetStatus = {}
    const lines = output.split('\n')

    for (const line of lines) {
      const match = line.match(/^\s*.\s+(enabled|disabled)\s+(\S+)\s+(.+)$/)
      if (match) {
        const [, status, name, description] = match
        toolsetStatus[name] = {
          enabled: status === 'enabled',
          description: description.trim(),
        }
      }
    }

    return toolsetStatus
  } catch {
    return {}
  }
}

// GET /api/tools/toolsets
toolsRouter.get('/', (req, res) => {
  try {
    const toolsetStatus = parseToolsList()

    const toolsets = Object.entries(TOOLSETS).map(([name, meta]) => {
      const status = toolsetStatus[name]
      return {
        name,
        label: meta.label,
        description: meta.description,
        enabled: status?.enabled ?? true,
        configured: meta.configured,
        tools: meta.tools,
      }
    })

    res.json(toolsets)
  } catch (err) {
    console.error('Error listing tools:', err)
    res.status(500).json({ error: 'Failed to list tools', details: err.message })
  }
})

// PUT /api/tools/toolsets/:name
toolsRouter.put('/:name', (req, res) => {
  try {
    const { enabled } = req.body
    const toolsetName = req.params.name

    if (!TOOLSETS[toolsetName]) {
      return res.status(404).json({ error: 'Toolset not found', toolset: toolsetName })
    }

    const meta = TOOLSETS[toolsetName]

    // Try to run hermes tools CLI to toggle
    try {
      const action = enabled ? 'enable' : 'disable'
      execSync(`hermes tools ${action} ${toolsetName}`, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      })
    } catch (execErr) {
      console.error(`Error running hermes tools ${enabled ? 'enable' : 'disable'}:`, execErr)
    }

    res.json({
      name: toolsetName,
      label: meta.label,
      description: meta.description,
      enabled,
      configured: meta.configured,
      tools: meta.tools,
    })
  } catch (err) {
    console.error('Error toggling toolset:', err)
    res.status(500).json({ error: 'Failed to toggle toolset', details: err.message })
  }
})
