import type { PullRequestRef } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { type PrMenuEntry, prMenuEntries } from './pr-menu'

const API_12 = { repository: 'acme/api', number: 12 }

type Options = { isSnoozed: boolean; isOwn?: boolean; blockers?: PullRequestRef[] }

function entries({ isSnoozed, isOwn = true, blockers = [] }: Options) {
  return prMenuEntries({ isSnoozed, isOwn, repository: 'acme/web', blockers })
}

function labels(options: Options): string[] {
  return entries(options).flatMap((entry) => (entry.type === 'separator' ? [] : [entry.label]))
}

function untilMerged(blockers: PullRequestRef[]): PrMenuEntry[] {
  const submenu = entries({ isSnoozed: false, blockers }).find((entry) => entry.type === 'submenu')
  return submenu?.type === 'submenu' ? submenu.entries : []
}

function actions(menu: PrMenuEntry[]): string[] {
  return menu.flatMap((entry) => {
    if (entry.type === 'item') return [JSON.stringify(entry.action)]
    if (entry.type === 'submenu') return actions(entry.entries)
    return []
  })
}

describe('prMenuEntries', () => {
  it('leads with the opens, then the copies, then snooze', () => {
    expect(labels({ isSnoozed: false })).toEqual([
      'Open on GitHub',
      'Open files changed',
      'Copy link',
      'Copy branch name',
      'Snooze until new activity',
      'Snooze for 4 hours',
      'Snooze until tomorrow',
    ])
  })

  it('offers the linked pull requests in a submenu after the timed options, even just one', () => {
    expect(labels({ isSnoozed: false, blockers: [API_12] }).slice(-2)).toEqual([
      'Snooze until tomorrow',
      'Snooze until PR merges',
    ])
  })

  it('names each linked pull request the way GitHub would on this repository', () => {
    const items = untilMerged([API_12, { repository: 'acme/web', number: 3 }])
    expect(items.map((entry) => entry.type !== 'separator' && entry.label)).toEqual([
      'api#12',
      '#3',
    ])
  })

  it('carries the linked pull request in the action', () => {
    expect(untilMerged([API_12])[0]).toMatchObject({
      action: { type: 'snooze-until-merged', blocker: API_12 },
    })
  })

  it('offers at most three linked pull requests', () => {
    const many = [1, 2, 3, 4].map((number) => ({ repository: 'acme/api', number }))
    expect(untilMerged(many)).toHaveLength(3)
  })

  it('offers no submenu without a linked pull request, or while snoozed', () => {
    expect(labels({ isSnoozed: false })).not.toContain('Snooze until PR merges')
    expect(labels({ isSnoozed: true, blockers: [API_12] })).not.toContain('Snooze until PR merges')
  })

  it("offers to wait for a re-request on someone else's pull request, last", () => {
    expect(labels({ isSnoozed: false, isOwn: false }).slice(-2)).toEqual([
      'Snooze until tomorrow',
      'Snooze until re-requested',
    ])
  })

  it('never offers it on your own pull request, which nobody asks you to review', () => {
    expect(labels({ isSnoozed: false, isOwn: true })).not.toContain('Snooze until re-requested')
  })

  it('collapses it into Unsnooze like the rest while snoozed', () => {
    expect(labels({ isSnoozed: true, isOwn: false })).not.toContain('Snooze until re-requested')
  })

  it('gives every item its own verb, so none leans on the section above it', () => {
    for (const label of labels({ isSnoozed: false, isOwn: false, blockers: [API_12] })) {
      expect(label).toMatch(/^(Open|Copy|Snooze) /)
    }
  })

  it('collapses the snooze options to Unsnooze when the pull request is snoozed', () => {
    expect(labels({ isSnoozed: true })).toEqual([
      'Open on GitHub',
      'Open files changed',
      'Copy link',
      'Copy branch name',
      'Unsnooze',
    ])
  })

  it('separates the opens, the copies and snooze into three sections', () => {
    const shape = entries({ isSnoozed: false }).map((entry) => entry.type)
    expect(shape).toEqual([
      'item',
      'item',
      'separator',
      'item',
      'item',
      'separator',
      'item',
      'item',
      'item',
    ])
  })

  it('never repeats an action', () => {
    for (const isSnoozed of [false, true]) {
      const all = actions(
        entries({
          isSnoozed,
          isOwn: false,
          blockers: [API_12, { repository: 'acme/web', number: 3 }],
        }),
      )
      expect(new Set(all).size).toBe(all.length)
    }
  })
})
