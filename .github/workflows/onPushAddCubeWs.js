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
            path: `add-cube.req`,
        })).data.sha
        await octokit.repos.deleteFile({
            owner: username,
            repo,
            path: `add-cube.req`,
            branch: "master",
            message: "remove request file",
            sha: sha1
        })

        let sha2 = (await octokit.repos.getContents({
            owner: username,
            repo,
            path: `add-cube-init.req`,
        })).data.sha
        await octokit.repos.deleteFile({
            owner: username,
            repo,
            path: `add-cube-init.req`,
            branch: "master",
            message: "remove request file",
            sha: sha2
        })
        return true
    } catch (err) {
        throw err
    }
}

// actions on push
let addCube = async (username, cube, gitToken, repo) => {
    const algorithm = 'aes256';

    try {
        // create add cube request type file
        await encryptAndPutAuthFile(username, repo.split('/')[1], algorithm, gitToken, "add-cube");

        let res1 = await axios.post("https://cubie.now.sh/api/add-cube", {
            username,
            cube,
            gitToken,
            repo: repo.split('/')[1]
        });
        if (res1.data.result) {
            // create add cube init request type file
            await encryptAndPutAuthFile(username, repo.split('/')[1], algorithm, gitToken, "add-cube-init");

            let r = (await axios.post("https://cubie.now.sh/api/add-cube-init", {
                username,
                cube,
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
            error: "Couldn't add cube: " + err.message
        }
    }

}

const wsOnPush = async (gitToken, repo) => {
    const cube = JSON.parse(fs.readFileSync(process.env.NODE_CUBE, 'utf8')).commits[0].message.split(".")[0];
    const userInfo = JSON.parse(fs.readFileSync(`.cubie/cube.json`, 'utf8')).user;
    return await addCube(userInfo.username, cube, gitToken, repo)
}

wsOnPush(process.argv[2], process.argv[3]).then((res) => {
    console.log(res)
})
