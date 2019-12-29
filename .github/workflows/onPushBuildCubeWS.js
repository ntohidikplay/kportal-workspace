const fs = require('fs');
const axios = require("axios");
const crypto = require('crypto');
const Octokit = require("@octokit/rest");

async function encryptAndPutAuthFile(username, repo, algorithm, gitToken, requestType) {
    try {
        var cipher = crypto.createCipher(algorithm, gitToken);
        var encryptedPhrase = cipher.update(requestType, 'utf8', 'hex');
        encryptedPhrase += cipher.final('hex');

        let octokit = new Octokit({
            auth: "token " + gitToken
        });
        await octokit.repos.createOrUpdateFile({
            owner: username,
            repo,
            path: `${requestType}.req`,
            branch: "master",
            message: "add request file",
            content: Buffer.from(encryptedPhrase).toString('base64'),
            gitToken
        });
        return true
    } catch (err) {
        throw err
    }
}

async function removeAuthFiles(username, repo, gitToken) {
    try {
        let octokit = new Octokit({
            auth: "token " + gitToken
        });

        let sha1 = (await octokit.repos.getContents({
            owner: username,
            repo,
            path: `build-cube.req`,
        })).data.sha
        await octokit.repos.deleteFile({
            owner: username,
            repo,
            path: `build-cube.req`,
            branch: "master",
            message: "remove request file",
            sha: sha1
        })

        let sha2 = (await octokit.repos.getContents({
            owner: username,
            repo,
            path: `build-cube-init.req`,
        })).data.sha
        await octokit.repos.deleteFile({
            owner: username,
            repo,
            path: `build-cube-init.req`,
            branch: "master",
            message: "remove request file",
            sha: sha2
        })
        return true
    } catch (err) {
        throw err
    }
}

let buildCube = async (username, cube, lessons, gitToken, repo) => {
    const algorithm = 'aes256';

    try {
        // create add cube request type file
        await encryptAndPutAuthFile(username, repo.split('/')[1], algorithm, gitToken, "build-cube");

        let res1 = await axios.post("https://cubie.now.sh/api/build-cube", {
            username,
            cube,
            gitToken,
            repo: repo.split('/')[1]
        });
        if (res1.data.result) {
            // create add cube init request type file
            await encryptAndPutAuthFile(username, repo.split('/')[1], algorithm, gitToken, "build-cube-init");

            let r = (await axios.post("https://cubie.now.sh/api/build-cube-init", {
                username,
                cube,
                lessons,
                gitToken,
                repo: repo.split('/')[1]
            })).data;
            
            if (r.result) {
                await removeAuthFiles(username, repo.split('/')[1], gitToken)
            }
            return r;
        }
    } catch (err) {
        return {
            result: false,
            error: err.message
        }
    }

}

const wsOnPush = async (gitToken, repo) => {
    const cube = JSON.parse(fs.readFileSync(process.env.cube, 'utf8')).commits[0].message.split(".")[0];
    const userInfo = JSON.parse(fs.readFileSync(`.cubie/cube.json`, 'utf8')).user;
    const lessons = JSON.parse(fs.readFileSync(`builds/${cube}.cube.json`, 'utf8')).lessons;
    return await buildCube(userInfo.username, cube, lessons, gitToken, repo)
}

wsOnPush(process.argv[2], process.argv[3]).then((res) => {
    console.log(res)
})
