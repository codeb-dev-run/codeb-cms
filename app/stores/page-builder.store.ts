import { create } from 'zustand';

export interface BlockConfig {
  id: string;
  type: 'hero' | 'recent-posts' | 'category-grid' | 'popular-posts' | 'banner';
  order: number;
  settings: Record<string, any>;
  isActive: boolean;
}

interface PageBuilderState {
  blocks: BlockConfig[];
  isDragging: boolean;
  activeBlockId: string | null;
  setBlocks: (blocks: BlockConfig[]) => void;
  addBlock: (type: BlockConfig['type']) => void;
  removeBlock: (id: string) => void;
  updateBlock: (id: string, settings: Partial<BlockConfig>) => void;
  reorderBlocks: (activeId: string, overId: string) => void;
  setIsDragging: (isDragging: boolean) => void;
  setActiveBlockId: (id: string | null) => void;
  toggleBlockActive: (id: string) => void;
}

export const usePageBuilderStore = create<PageBuilderState>((set) => ({
  blocks: [],
  isDragging: false,
  activeBlockId: null,

  setBlocks: (blocks) => set({ blocks }),

  addBlock: (type) => {
    const newBlock: BlockConfig = {
      id: `block-${Date.now()}`,
      type,
      order: 0,
      settings: getDefaultSettings(type),
      isActive: true,
    };

    set((state) => {
      const maxOrder = Math.max(...state.blocks.map(b => b.order), -1);
      newBlock.order = maxOrder + 1;
      return { blocks: [...state.blocks, newBlock] };
    });
  },

  removeBlock: (id) => set((state) => ({
    blocks: state.blocks.filter(block => block.id !== id)
  })),

  updateBlock: (id, updates) => set((state) => ({
    blocks: state.blocks.map(block =>
      block.id === id ? { ...block, ...updates } : block
    )
  })),

  reorderBlocks: (activeId, overId) => set((state) => {
    const activeIndex = state.blocks.findIndex(b => b.id === activeId);
    const overIndex = state.blocks.findIndex(b => b.id === overId);

    if (activeIndex === -1 || overIndex === -1) return state;

    const newBlocks = [...state.blocks];
    const [removed] = newBlocks.splice(activeIndex, 1);
    newBlocks.splice(overIndex, 0, removed);

    // Update order values
    const reorderedBlocks = newBlocks.map((block, index) => ({
      ...block,
      order: index
    }));

    return { blocks: reorderedBlocks };
  }),

  setIsDragging: (isDragging) => set({ isDragging }),
  setActiveBlockId: (id) => set({ activeBlockId: id }),
  toggleBlockActive: (id) => set((state) => ({
    blocks: state.blocks.map(block =>
      block.id === id ? { ...block, isActive: !block.isActive } : block
    )
  })),
}));

function getDefaultSettings(type: BlockConfig['type']): Record<string, any> {
  switch (type) {
    case 'hero':
      return {
        title: '환영합니다',
        subtitle: 'CodeB CMS와 함께 시작하세요',
        backgroundImage: '',
        height: '400px',
        textAlign: 'center',
      };
    case 'recent-posts':
      return {
        title: '최근 게시물',
        count: 6,
        columns: 3,
        showThumbnail: true,
        showExcerpt: true,
        showDate: true,
        showAuthor: true,
      };
    case 'category-grid':
      return {
        title: '카테고리',
        columns: 4,
        showPostCount: true,
        showIcon: true,
      };
    case 'popular-posts':
      return {
        title: '인기 게시물',
        count: 5,
        period: 'week', // week, month, all
        showThumbnail: true,
        showViewCount: true,
      };
    case 'banner':
      return {
        content: '',
        backgroundColor: '#f3f4f6',
        textColor: '#1f2937',
        padding: '2rem',
        link: '',
      };
    default:
      return {};
  }
}