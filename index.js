#!/usr/bin/env node

const io = require('socket.io-client')
const macaddress = require('macaddress')
const { _exec } = require('./cmd')

/* golbal params */
const minPort = 50000
const maxPort = 60000
const awsPort = 8090
const awsHost = 'videostream.fidodarts.com'
const url = `http://${awsHost}:${awsPort}`
const FFmpegWsd = 'fidodarts'

let myMac = ''
let myId = ''
let portData = []
let camData = [null, null, null, null]
let intervalId = null

const ioClient = io.connect(url)

macaddress.one('eth0', (err, mac) => {
    if (!err) {
        myMac = mac
    }
})

ioClient.on('connect', () => {
    console.log(`pi connect`)
    /* 取得Id，資料庫紀錄連線及sid */
    ioClient.emit('getId', { mac: myMac })
})

ioClient.on('setId', (data) => {
    /* 設定myId為 table iteam_pi id */
    myId = data[0].id
    /* 取得 4個 port，資料庫紀錄此台 pi 可使用 port */
    ioClient.emit('getPort', { pi_id: myId })
    //run()
})

ioClient.on('setPort', (data) => {
    /* 設定 portData */
    portData = data

    detectCam()

    intervalId = setInterval(() => {
        detectCam()
    }, 10000)
})

ioClient.on('runFFmpeg', (data) => {
    var cmd = ''
    var hw = 1
    if (data.port_name === '/dev/video2') {
        hw = 2
    } else if (data.port_name === '/dev/video4') {
        hw = 3
    }
    switch (data.usb_id) {
        case 1:
        case 2:
        case 4:
            cmd = `ffmpeg -f v4l2 -framerate 20 -video_size 640x480 -i ${data.port_name} -f alsa -ar 44100 -i hw:${hw} -f mpegts -codec:v mpeg1video -r 59.94 -s 320x180 -aspect 16:9 -b:v 1000k -bf 0 -codec:a mp2 -b:a 128k -muxdelay 0.001 http://${awsHost}:${data.port}/${FFmpegWsd}`
            if (data.type === 1) {
                cmd = `ffmpeg -f v4l2 -framerate 20 -video_size 640x480 -i ${data.port_name} -f mpegts -codec:v mpeg1video -r 59.94 -s 320x180 -aspect 16:9 -b:v 1000k -bf 0 -codec:a mp2 -b:a 128k -muxdelay 0.001 http://${awsHost}:${data.port}/${FFmpegWsd}`
            }
            break
        case 3:
            cmd = `ffmpeg -f v4l2 -framerate 10 -video_size 640x480 -i ${data.port_name} -f alsa -ar 44100 -i hw:${hw} -f mpegts -codec:v mpeg1video -r 59.94 -s 640x404 -aspect 16:9 -b:v 1000k -bf 0 -codec:a mp2 -b:a 128k -muxdelay 0.001 http://${awsHost}:${data.port}/${FFmpegWsd}`
            break
    }
    _exec(cmd).then(value => {
            //console.log(value)
        })
        .catch(err => {
            console.log(`ffmpeg run error : ${data}`)
        })

})

ioClient.on('fcnr', (data) => {
    fcnr(data)
})

ioClient.on("disconnect", () => {
    console.log(`pi disconnect`)
    myId = ''
    portData = []
    camData = [null, null, null, null]
    clearInterval(intervalId)
})

async function detectCam() {
    var cmd = "v4l2-ctl --list-devices"
    _exec(cmd).then(value => {
        var usbList = listUSB(value)
        setCamData(usbList)
    }).catch(err => {
        var usbList = []
        setCamData(usbList)
    })

}

async function fcnr(d) {
    var port = d.port * 1
    var cmd = `ssh -fCNR ${port}:localhost:22 pi@${awsHost} -i /home/ubuntu/.ssh/id_rsa`
    _exec(cmd)
    setTimeout(() => {
        ioClient.emit('fcnrEcho', d)
    }, 1000)
}

async function setCamData(usbList) {
    var cams = [null, null, null, null]
    for (var i = 0; i <= 2; i++) {
        if (usbList[i]) {
            var d = {}
            var nos = usbList[i].name.split(' (usb-0000:01:00.0-1.')
            d.usb_id = (nos[1].replace(')', '') * 1)
            d.dev_name = nos[0]
            d.port_name = usbList[i].devices[0].name
            if (d.dev_name === 'USB Video: USB Video' || d.dev_name === 'USB3. 0 capture: USB3. 0 captur') {
                d.type = 1
            } else {
                d.type = 2
            }
            cams[(d.usb_id - 1)] = d
        }
    }
    portData.map((item, index) => {
        if (JSON.stringify(camData[index]) !== JSON.stringify(cams[index])) {
            camData[index] = cams[index]
            var sendCamData = {}
            if (cams[index] === null) {
                sendCamData.dev_name = null
                sendCamData.port_name = null
                sendCamData.type = 1
                sendCamData.usb_id = index + 1
            } else {
                sendCamData = camData[index]
            }
            ioClient.emit('setCamData', { pi_id: myId, port: item, camData: sendCamData })
        }
    })
}

function listUSB(txt) {
    let lines = txt.split('\n')
    let devices = []
    let cur
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
        if (line.endsWith(":")) {
            let dev = {}
            if (line.indexOf('bcm2835') >= 0) {
                cur = undefined
                continue
            }
            dev.name = line.substr(0, line.length - 1)
            dev.devices = []
            devices.push(dev)
            cur = dev
            continue
        }
        if (line.indexOf('/dev/video') >= 0 && cur) {
            let nos = line.split('/dev/video')
            if ((nos[1] * 1) % 2 === 0 && (nos[1] * 1) <= 4) {
                let dev = { name: line.trim() }
                cur.devices.push(dev)
            }
        }
    }

    return devices
}