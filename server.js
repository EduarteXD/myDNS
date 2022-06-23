const dgram = require('dgram')
const server = dgram.createSocket('udp4')
const fs = require('fs')
const request = require('request')

const defaultDNS = '8.8.8.8'

const geoSiteData = 'https://raw.githubusercontent.com/v2fly/domain-list-community/master/data/'

var rules = {}
var buffered = {}

const init = () => {
    fs.readFile('./config.json', 'utf8', (err, data)=> {
        let config = JSON.parse(data)
        for (let key in config)
        {
            request(geoSiteData + key, (err, res, body) => {
                if(!err)
                {
                    let domains = body.split('\n')
                    for (let line in domains)
                    {
                        if (domains[line].trim() !== '' && domains[line].trim()[0] !== '#')
                        {
                            rules[domains[line].trim()] = config[key]
                        }
                    }
                    console.log(`fetched geosite: ${key}`)
                }
                else
                {
                    console.warn(`failed to fetch geosite: ${key}`)
                }
            })
        }
    })
}

init()

const findOptimalSource = (addr) => {
    domain = addr.split('.').slice(-2).join('.')
    if (domain in rules)
    {
        return rules[domain]
    }
    return defaultDNS
}

const handOver = (msg, dns, rinfo, addr) => {
    const client = dgram.createSocket('udp4')

    client.on('error', (err) => {
        console.log(`client error:` + err.stack)
        client.close();
    })

    client.on('message', (fMsg) => {
        buffered[addr] = fMsg
        console.log(JSON.stringify(fMsg))
        server.send(fMsg, rinfo.port, rinfo.address, (err) => {
            if (err)
            {
                console.warn('something went wrong when send back data:')
                console.warn(err)
            }
        })
        client.close()
    })

    client.send(msg, 53, dns, (err) => {
        if (err) {
            if (err)
            {
                console.warn('something went wrong when query dns:')
                console.warn(err)
                client.close()
            }
        }
    })
}

const resolveReq = (buffer) => {
    let data = JSON.parse(buffer).data
    let iter = 12
    let addr = ''
    while (data[iter])
    {
        for (let i = 1; i <= data[iter]; ++i)
        {
            addr += String.fromCharCode(data[iter + i])
        }
        iter += data[iter] + 1
        if (data[iter])
        {
            addr += '.'
        }
    }
    return addr
}

server.on('message', (msg, rinfo) => {
    let addr = resolveReq(JSON.stringify(msg))
    console.log(JSON.stringify(msg))
    console.log(addr)
    let dns = findOptimalSource(addr)
    if (addr in buffered)
    {
        let fMsg = buffered[addr]
        fMsg[0] = msg[0]
        fMsg[1] = msg[1]
        server.send(fMsg, rinfo.port, rinfo.address, (err) => {
            if (err)
            {
                console.warn('something went wrong receiving data:')
                console.warn(err)
            }
        })
    }
    else
    {
        handOver(msg, dns, rinfo, addr)
    }
})

server.on('error', (err) => {
    console.log('server error:' + err.stack)
    server.close()
})

server.on('listening', () => {
    const addr = server.address()
    console.log(`server is running at ${addr.address}:${addr.port}`)
})

server.bind(53)