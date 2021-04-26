const exec = require('child_process').exec

let _exec = function(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error)
            } else {
            	resolve( stdout )
            }
        })
    })
}

module.exports = { _exec }