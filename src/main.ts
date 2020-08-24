import os from 'os'
import path from 'path'

import * as core from '@actions/core'
import { context } from '@actions/github'
import { exec } from '@actions/exec'
import dateFormat from 'date-fns/format'
import stringTemplate from 'string-template'
import slugify from 'slugify'

function trimSlash(value: string): string {
  return value.replace(/^\/|\/$/g, '')
}

export async function getObjectName(): Promise<{ objectDir: string; objectName: string }> {
  const timeFormat = core.getInput('timeFormat')
  const objectDirTemplate = trimSlash(core.getInput('objectDir'))
  const objectNameTemplate = trimSlash(core.getInput('objectName'))

  const templateVars = {
    date: dateFormat(new Date(), 'yyyy-MM-dd'),
    owner: context.repo.owner,
    ref: slugify(context.ref.split('/').slice(2).join('/')),
    repo: context.repo.repo,
    sha: context.sha.substring(0, 8),
    time: dateFormat(new Date(), timeFormat),
  }

  const objectName = stringTemplate(objectNameTemplate, templateVars)
  let objectDir = stringTemplate(objectDirTemplate, templateVars)

  if (objectDir) {
    objectDir += '/'
  }

  core.debug(`objectName = ${objectName}`)
  core.debug(`objectDir = ${objectDir}`)

  return { objectDir, objectName }
}

export async function run(): Promise<void> {
  try {
    const { objectDir, objectName } = await getObjectName()

    const bundleExt = `.tar.gz`
    const bundleDir = path.join(os.tmpdir(), objectName)
    const bundlePath = path.join(os.tmpdir(), `${objectName}${bundleExt}`)

    const repository = core.getInput('repository')
    const token = core.getInput('token')
    const repositoryUrl = `https://${context.actor}:${token}@github.com/${repository}`

    await exec('git clone --mirror', [repositoryUrl, bundleDir])
    await exec('tar -zcf', [bundlePath, `-C`, bundleDir, '.'])

    const s3Bucket = core.getInput('bucket')
    const s3Args = core.getInput('args')
    const s3Dest = `s3://${s3Bucket}/${objectDir}${objectName}${bundleExt}`

    core.debug(`s3Dest = ${s3Dest}`)

    await exec(`aws s3 cp --no-progress ${s3Args}`, [bundlePath, s3Dest], {
      env: {
        AWS_ACCESS_KEY_ID: core.getInput('accessKeyId'),
        AWS_SECRET_ACCESS_KEY: core.getInput('secretAccessKey'),
      },
    })

    await exec('rm', ['-rf', bundlePath, bundleDir])
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
