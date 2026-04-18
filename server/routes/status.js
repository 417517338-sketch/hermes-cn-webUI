import { Router } from 'express'
import os from 'os'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

export const statusRouter = Router()

const HERMES_HOME = process.env.HERMES_HOME || join(os.homedir(), '.hermes')

// Load Hermes version from Agent's pyproject or release file
function getHermesVersion() {
  try {
    // Try reading from the agent directory
    const pyprojectPath = join(HERMES_HOME, 'hermes-agent', 'pyproject.toml')
    if (existsSync(pyprojectPath)) {
      const content = readFileSync(pyprojectPath, 'utf-8')
      const match = content.match(/version\s*=\s*["']([^"']+)["']/)
      if (match) return match[1]
    }
    // Fallback: run hermes --version
    const output = execSync('hermes --version 2>&1', { encoding: 'utf-8', maxBuffer: 4096 })
    const match = output.match(/(\d+\.\d+\.\d+)/)
    return match ? match[1] : 'unknown'
  } catch {
    return 'unknown'
  }
}

// Get Hermes release date
function getReleaseDate() {
  try {
    const releasePath = join(HERMES_HOME, 'RELEASE_latest.md')
    if (existsSync(releasePath)) {
      const content = readFileSync(releasePath, 'utf-8')
      const match = content.match(/^#\s*Release\s+v[\d.]+\s*\(([^)]+)\)/m)
      if (match) return match[1]
    }
    return new Date().toISOString().split('T')[0]
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

// Check gateway process status
function getGatewayState() {
  const stateFile = join(HERMES_HOME, 'gateway_state.json')
  try {
    if (!existsSync(stateFile)) {
      return { running: false, pid: null, state: 'stopped', exit_reason: null, updated_at: null, platforms: {} }
    }
    const raw = readFileSync(stateFile, 'utf-8')
    const state = JSON.parse(raw)
    const pid = state.pid ? parseInt(state.pid, 10) : null

    if (!pid) return { running: false, pid: null, state: 'stopped', exit_reason: null, updated_at: null, platforms: {} }

    // Check if process is alive
    try {
      process.kill(pid, 0)
      return {
        running: true,
        pid,
        state: state.gateway_state || 'running',
        exit_reason: state.exit_reason || null,
        updated_at: state.updated_at || null,
        platforms: state.platforms || {},
      }
    } catch {
      // Process doesn't exist
      return { running: false, pid: null, state: 'stopped', exit_reason: null, updated_at: null, platforms: {} }
    }
  } catch {
    return { running: false, pid: null, state: 'stopped', exit_reason: null, updated_at: null, platforms: {} }
  }
}

statusRouter.get('/', (req, res) => {
  const uptime = process.uptime()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const gw = getGatewayState()

  const version = getHermesVersion()
  const releaseDate = getReleaseDate()

  res.json({
    active_sessions: 0, // Sessions counted from state.db
    config_path: join(HERMES_HOME, 'config.yaml'),
    config_version: 1,
    env_path: join(HERMES_HOME, '.env'),
    gateway_exit_reason: gw.exit_reason,
    gateway_pid: gw.pid,
    gateway_platforms: gw.platforms,
    gateway_running: gw.running,
    gateway_state: gw.state,
    gateway_updated_at: gw.updated_at,
    hermes_home: HERMES_HOME,
    latest_config_version: 1,
    release_date: releaseDate,
    version,
  })
})
