import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import ChessBoard from '../components/ChessBoard.vue'
import MoveHistory from '../components/MoveHistory.vue'
import { useBoardInteraction } from '../composables/useBoardInteraction'
import { STARTING_FEN, buildPosition } from '../services/chessRules'
import { displaySquares, displayToSquare, squareToDisplay } from '../services/squares'
import { fail, ok, type MoveInput, type Position } from '../types'
import { mv } from './helpers'

function position(fen = STARTING_FEN, moves: string[] = []): Position {
  const built = buildPosition(fen, moves.map(mv))
  if (!built.ok) throw new Error(built.error)
  return built.value
}

describe('orientation mapping', () => {
  it('maps squares to display cells for both orientations', () => {
    expect(displaySquares('w').slice(0, 2)).toEqual(['a8', 'b8'])
    expect(displaySquares('b').slice(0, 2)).toEqual(['h1', 'g1'])
    expect(squareToDisplay('a1', 'w')).toEqual({ row: 7, col: 0 })
    expect(squareToDisplay('a1', 'b')).toEqual({ row: 0, col: 7 })
    for (const sq of ['c3', 'h8', 'e5'] as const) {
      for (const o of ['w', 'b'] as const) {
        const { row, col } = squareToDisplay(sq, o)
        expect(displayToSquare(row, col, o)).toBe(sq)
      }
    }
  })

  it('renders the same square keys in flipped order', () => {
    const white = mount(ChessBoard, { props: { position: position(), orientation: 'w' } })
    const black = mount(ChessBoard, { props: { position: position(), orientation: 'b' } })
    const order = (w: typeof white) => w.findAll('[data-square]').map((n) => n.attributes('data-square'))
    expect(order(white)[0]).toBe('a8')
    expect(order(black)[0]).toBe('h1')
    expect(new Set(order(white))).toEqual(new Set(order(black)))
  })
})

describe('ChessBoard keyboard and labels', () => {
  it('moves focus with arrow keys relative to orientation and activates with Enter', async () => {
    const wrapper = mount(ChessBoard, {
      props: { position: position(), orientation: 'b' },
      attachTo: document.body,
    })
    const e7 = wrapper.get('[data-square="e7"]')
    expect(e7.attributes('tabindex')).toBe('0')
    // With black at the bottom, "up" on screen heads towards rank 1 and "left" towards the h-file.
    await e7.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement?.getAttribute('data-square')).toBe('e6')
    await wrapper.get('[data-square="e6"]').trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement?.getAttribute('data-square')).toBe('f6')
    await wrapper.get('[data-square="f6"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('activate')).toEqual([['f6']])
    wrapper.unmount()
  })

  it('describes pieces, selection, targets and check without relying on colour', () => {
    const checked = position(STARTING_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
    const wrapper = mount(ChessBoard, {
      props: {
        position: checked,
        orientation: 'w',
        selected: 'g1',
        targets: [{ from: 'g1', to: 'h3', san: 'Nh3', color: 'w', piece: 'n' }],
      },
    })
    expect(wrapper.get('[data-square="e1"]').attributes('aria-label')).toBe('e1, white king, in check')
    expect(wrapper.get('[data-square="g1"]').attributes('aria-label')).toBe('g1, white knight, selected')
    expect(wrapper.get('[data-square="h3"]').attributes('aria-label')).toBe('h3, empty, legal move')
    expect(wrapper.get('[data-square="h4"]').attributes('aria-label')).toContain('last move')
  })

  it('emits drag events with the drop square and treats a release off-board as cancel', async () => {
    const wrapper = mount(ChessBoard, {
      props: { position: position(), orientation: 'w', movableColor: 'w' },
      attachTo: document.body,
    })
    const board = wrapper.get('[role="grid"]').element as HTMLElement
    board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800, x: 0, y: 0, toJSON: () => ({}) })
    const e2 = wrapper.get('[data-square="e2"]')
    const pointer = (type: string, x: number, y: number) =>
      new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 })
    e2.element.dispatchEvent(pointer('pointerdown', 450, 650))
    board.dispatchEvent(pointer('pointermove', 450, 450))
    board.dispatchEvent(pointer('pointerup', 450, 450))
    expect(wrapper.emitted('drag-start')).toEqual([['e2']])
    expect(wrapper.emitted('drop')).toEqual([['e2', 'e4']])
    e2.element.dispatchEvent(pointer('pointerdown', 450, 650))
    board.dispatchEvent(pointer('pointermove', 450, 450))
    board.dispatchEvent(pointer('pointerup', 900, 450))
    expect(wrapper.emitted('drop')?.[1]).toEqual(['e2', null])
    wrapper.unmount()
  })
})

describe('en passant presentation', () => {
  it('marks the square of the pawn removed by en passant', () => {
    const pos = position(STARTING_FEN, ['e2e4', 'a7a6', 'e4e5', 'f7f5', 'e5f6'])
    const wrapper = mount(ChessBoard, { props: { position: pos, orientation: 'w' } })
    const f5 = wrapper.get('[data-square="f5"]')
    expect(f5.attributes('aria-label')).toBe('f5, empty, pawn captured en passant')
    expect(f5.find('.removed-mark').exists()).toBe(true)
    expect(wrapper.findAll('.removed-mark')).toHaveLength(1)
  })

  it('tags en passant moves in the move list', () => {
    const pos = position(STARTING_FEN, ['e2e4', 'a7a6', 'e4e5', 'f7f5', 'e5f6'])
    const wrapper = mount(MoveHistory, {
      props: { moves: [pos.lastMove!], viewPly: 1, startColor: 'w', startMoveNumber: 1 },
    })
    expect(wrapper.get('abbr[title="en passant"]').text()).toBe('e.p.')
    expect(wrapper.get('[aria-current="true"]').attributes('aria-label')).toBe('Move 1, white: exf6, en passant')
  })
})

describe('useBoardInteraction', () => {
  function setup(fen: string, canInteract = true, autoQueen = false) {
    const pos = ref(position(fen))
    const submitted: MoveInput[] = []
    const submitMove = vi.fn((input: MoveInput) => {
      submitted.push(input)
      const legal = pos.value.legalMoves.find(
        (m) => m.from === input.from && m.to === input.to && m.promotion === input.promotion,
      )
      return legal ? ok(legal) : fail<never>('illegal')
    })
    const interaction = useBoardInteraction({
      position: pos,
      canInteract: computed(() => canInteract),
      autoQueen: computed(() => autoQueen),
      submitMove,
    })
    return { interaction, submitted, submitMove }
  }

  it('collects a promotion choice before submitting, and cancel submits nothing', () => {
    const { interaction, submitted } = setup('8/P7/8/8/8/8/8/k6K w - - 0 1')
    interaction.activate('a7')
    interaction.activate('a8')
    expect(interaction.pendingPromotion.value).toEqual({ from: 'a7', to: 'a8' })
    expect(submitted).toHaveLength(0)
    interaction.cancelPromotion()
    expect(interaction.pendingPromotion.value).toBeNull()
    expect(interaction.selected.value).toBeNull()
    expect(submitted).toHaveLength(0)
    interaction.activate('a7')
    interaction.activate('a8')
    interaction.choosePromotion('r')
    expect(submitted).toEqual([{ from: 'a7', to: 'a8', promotion: 'r' }])
  })

  it('promotes straight to a queen when auto-queen is on', () => {
    const { interaction, submitted } = setup('8/P7/8/8/8/8/8/k6K w - - 0 1', true, true)
    interaction.activate('a7')
    interaction.activate('a8')
    expect(interaction.pendingPromotion.value).toBeNull()
    expect(submitted).toEqual([{ from: 'a7', to: 'a8', promotion: 'q' }])
  })

  it('selects, switches between friendly pieces and deselects', () => {
    const { interaction, submitMove } = setup(STARTING_FEN)
    interaction.activate('e7') // opponent piece: ignored
    expect(interaction.selected.value).toBeNull()
    interaction.activate('e2')
    expect(interaction.targetSquares.value).toEqual(new Set(['e3', 'e4']))
    interaction.activate('g1')
    expect(interaction.selected.value).toBe('g1')
    interaction.activate('g1')
    expect(interaction.selected.value).toBeNull()
    interaction.activate('e2')
    interaction.activate('e5') // not a target: clears without submitting
    expect(interaction.selected.value).toBeNull()
    expect(submitMove).not.toHaveBeenCalled()
  })

  it('ignores input when interaction is disabled', () => {
    const { interaction } = setup(STARTING_FEN, false)
    interaction.activate('e2')
    expect(interaction.dragStart('e2')).toBe(false)
    expect(interaction.selected.value).toBeNull()
  })

  it('submits dropped moves and clears on an invalid drop', () => {
    const { interaction, submitted } = setup(STARTING_FEN)
    expect(interaction.dragStart('e2')).toBe(true)
    interaction.drop('e2', 'e5')
    expect(submitted).toHaveLength(0)
    expect(interaction.selected.value).toBeNull()
    interaction.dragStart('e2')
    interaction.drop('e2', 'e4')
    expect(submitted).toEqual([{ from: 'e2', to: 'e4' }])
  })
})
