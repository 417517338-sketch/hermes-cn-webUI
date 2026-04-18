import { describe, it, expect } from 'vitest'
import { formatRelativeTime, formatUptime } from '@/lib/dashboard'

describe('Dashboard utility functions', () => {
  describe('formatRelativeTime', () => {
    it('returns "刚刚" for times less than 1 minute ago', () => {
      const now = new Date()
      const lessThanAMinuteAgo = new Date(now.getTime() - 30 * 1000).toISOString()
      expect(formatRelativeTime(lessThanAMinuteAgo)).toBe('刚刚')
    })

    it('returns minutes for times less than an hour', () => {
      const now = new Date()
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
      expect(formatRelativeTime(tenMinutesAgo)).toBe('10分钟前')
    })

    it('returns hours for times less than a day', () => {
      const now = new Date()
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
      expect(formatRelativeTime(threeHoursAgo)).toBe('3小时前')
    })

    it('returns days for times less than a week', () => {
      const now = new Date()
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
      expect(formatRelativeTime(twoDaysAgo)).toBe('2天前')
    })
  })

  describe('formatUptime', () => {
    it('returns minutes only for times less than an hour', () => {
      // 30 seconds floors to 0 minutes
      expect(formatUptime(30)).toBe('0分钟')
      expect(formatUptime(59 * 60)).toBe('59分钟')
    })

    it('returns hours and minutes for times less than a day', () => {
      expect(formatUptime(60 * 60)).toBe('1小时 0分钟')
      expect(formatUptime(90 * 60)).toBe('1小时 30分钟')
    })

    it('returns days and hours for times a day or more', () => {
      expect(formatUptime(24 * 60 * 60)).toBe('1天 0小时')
      expect(formatUptime(24 * 60 * 60 + 6 * 60 * 60)).toBe('1天 6小时')
    })
  })
})
