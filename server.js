require('dotenv').config()
const express = require('express')
const cors = require('cors')
const fs = require('fs').promises
const path = require('path')
const rateLimit = require('express-rate-limit')

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 250,
    message: {
        success: false,
        error: 'muitas requisicoes',
        message: 'limite de 250 requisicoes por minuto excedido, tente novamente mais tarde'
    },
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            error: 'muitas requisicoes',
            message: 'limite de 150 requisicoes por minuto excedido, tente novamente mais tarde'
        })
    }
})

const blockedIP = new Map()

const checkBlockedIP = (req, res, next) => {
    const blockedInfo = blockedIP.get(req.ip)
    
    if (blockedInfo) {
        if (Date.now() < blockedInfo.until) {
            const remainingTime = Math.ceil((blockedInfo.until - Date.now()) / 60000)
            return res.status(429).json({
                success: false,
                error: 'muitas requisicoes',
                message: `muitas requisicoes, tente novamente em ${remainingTime} minutos`
            })
        } else {
            blockedIP.delete(req.ip)
        }
    }
    
    next()
}

const requestCounter = (req, res, next) => {
    const now = Date.now()

    const requestTimestamps = req.requestsByIP.get(req.ip) || []
    
    const timestampRecent = requestTimestamps.filter(timestamp => now - timestamp < 60 * 1000)
    
    timestampRecent.push(now)
    
    req.requestsByIP.set(req.ip, timestampRecent)
    
    if (timestampRecent.length > 300) {
        const blockDuration = 30 * 60 * 1000
        blockedIP.set(req.ip, { until: now + blockDuration })
        return res.status(429).json({
            success: false,
            error: 'muitas requisicoes',
            message: 'muitas requisicoes, seu ip foi bloqueado por 30 minutos'
        })
    }
    
    next()
}

const app = express()
const PORT = process.env.PORT || 3000

app.use((req, res, next) => {
    req.requestsByIP = new Map()
    next()
})

// Nao sei se tem um jeito mais otimizado de fazer isso :/
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(checkBlockedIP)
app.use(requestCounter)
app.use(apiLimiter)

function authenticate(req, res, next) {
    
    if (!req.headers.authorization) {
        return res.status(401).json({
            success: false,
            error: 'nao autorizado',
            message: 'token de autenticacao nao fornecido'
        })
    }
    
    const token = req.headers.authorization.split(' ')[1]
    
    if (token !== process.env.PASSWORD) {
        return res.status(403).json({
            success: false,
            error: 'acesso negado',
            message: 'token de autenticacao invalido'
        })
    }
    
    next()
}

let tierData = []

async function saveTierData() {
    try {
        await fs.writeFile(path.join(__dirname, 'latest_tiers.json'), JSON.stringify(tierData, null, 2), 'utf-8')
        console.log(`dados salvos com sucesso: ${tierData.length} jogadores`)
        return true
    } catch (error) {
        console.error('erro ao salvar dados dos tiers:', error)
        return false
    }
}

async function loadTierData() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'latest_tiers.json'), 'utf-8')
        tierData = JSON.parse(data)
        console.log(`Dados carregados: ${tierData.length} jogadores`)
    } catch (error) {
        console.error('Erro ao carregar dados dos tiers:', error)
        process.exit(1)
    }
}

app.get('/api/profile/:username', (req, res) => {
    const username = req.params.username.toLowerCase()
    
    const player = tierData.find(p => p.jogador.toLowerCase() === username)
    
    if (!player) {
        return res.status(404).json({
            success: false,
            error: 'jogador nao encontrado'
        })
    }
    
    res.json({
        success: true,
        data: player
    })
})

app.post('/api/remover', authenticate, async (req, res) => {
    try {

        // nao me perguntem por que que funciona com const { username }
        // eu nao sei porque que nao funciona sem
        const { username } = req.body

        if (!username) {
            return res.status(400).json({
                success: false,
                error: 'campo obrigatorio faltando',
                message: 'o campo username e obrigatorio'
            })
        }

        const playerIndex = tierData.findIndex(p => p.jogador.toLowerCase() === username.toLowerCase())
        
        if (playerIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'jogador nao encontrado',
                message: `nenhum jogador encontrado com o nome: ${username}`
            })
        }

        const removePlayer = tierData.splice(playerIndex, 1)
        await saveTierData()
        
        return res.json({
            success: true,
            message: 'jogador removido com sucesso',
            data: removePlayer
        })
        
    } catch (error) {
        console.error('erro ao remover jogador:', error)
        res.status(500).json({
            success: false,
            error: 'erro interno do servidor',
            message: 'nao foi possivel processar a requisicao'
        })
    }
})

app.post('/api/addtier', authenticate, async (req, res) => {
    try {
        const { username, tier } = req.body

        if (!username || !tier) {
            return res.status(400).json({
                success: false,
                error: 'campos obrigatorios faltando',
                message: 'os campos username e tier sao obrigatorios'
            })
        }

        const existingPlayerIndex = tierData.findIndex(p => p.jogador.toLowerCase() === username.toLowerCase())
        
        if (existingPlayerIndex >= 0) {
            tierData[existingPlayerIndex].ranking = tier
            await saveTierData()
            
            return res.json({
                success: true,
                message: 'Tier atualizado com sucesso',
                data: {
                    jogador: tierData[existingPlayerIndex].jogador,
                    ranking: tier
                }
            })
        } else {
            const newPlayer = {
                jogador: username,
                ranking: tier
            }
            
            tierData.push(newPlayer)
            await saveTierData()
            
            return res.status(201).json({
                success: true,
                message: 'Jogador adicionado com sucesso',
                data: newPlayer
            })
        }
    } catch (error) {
        console.error('erro ao adicionar/atualizar tier:', error)
        res.status(500).json({
            success: false,
            error: 'erro interno do servidor',
            message: 'nao foi possivel processar a requisicao'
        })
    }
})


app.get('/api/status', (req, res) => {
    // espero que esteja certo lol
    res.json({
        status: 'online',
        totalPlayers: tierData.length
    })
})

app.get('/api/servers', async (req, res) => {
    try {
        const serversData = await fs.readFile(path.join(__dirname, 'servers.json'), 'utf-8')
        const servers = JSON.parse(serversData)
        
        res.json({
            success: true,
            data: servers
        })
    } catch (error) {
        console.error('erro ao ler arquivo de servidores:', error)
        res.status(500).json({
            success: false,
            error: 'erro interno do servidor',
            message: 'nao foi possivel carregar a lista de servidores'
        })
    }
})

async function startServer() {
    try {
        await loadTierData()
        
        app.listen(PORT, () => {
            console.log(`Servidor rodando na http://localhost:${PORT}`)
            console.log(`- endpoint do perfil: GET /api/profile/:username`)
            console.log(`- endpoint do status: GET /api/status`)
            console.log(`- endpoint dos servidores: GET /api/servers`)
            console.log(`- endpoint de adicionar tier: POST /api/addtier`)
            console.log(`- endpoint de remover tier: POST /api/remover`)
        })
    } catch (error) {
        console.error('erro ao iniciar o servidor:', error)
        process.exit(1)
    }
}

startServer()

app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).json({
        success: false,
        error: 'erro interno do servidor',
        message: 'algo deu errado'
    })
})

module.exports = app
