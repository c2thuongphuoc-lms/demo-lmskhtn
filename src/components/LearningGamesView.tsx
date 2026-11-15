import React, { useState, useEffect, useMemo } from 'react';
import { Course, LearningGame, LearningGamePlatform, User } from '../types';
import {
  Gamepad2,
  Plus,
  Search,
  Play,
  ExternalLink,
  Edit3,
  Trash2,
  X,
  RotateCcw,
  Maximize2,
  BookOpen,
  Layers,
  Globe,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link2,
} from 'lucide-react';
import {
  getStoredLearningGames,
  fetchLearningGamesFromApi,
  upsertLearningGameApi,
  deleteLearningGameApi,
} from '../lib/storage';
import { notifySyncStatus } from './SyncNotificationToast';

interface LearningGamesViewProps {
  currentUser: User | null;
  courses: Course[];
  isTeacherTestingMode?: boolean;
  onOpenCourse?: (courseId: string) => void;
}

const PLATFORM_META: Record<
  LearningGamePlatform,
  {
    label: string;
    accentText: string;
    accentBg: string;
    accentBorder: string;
    embedFriendly: boolean;
    hint: string;
  }
> = {
  Wordwall: {
    label: 'Wordwall',
    accentText: 'text-sky-700',
    accentBg: 'bg-sky-50',
    accentBorder: 'border-sky-200',
    embedFriendly: true,
    hint: 'Tự động chuyển sang chế độ nhúng tương tác Wordwall.',
  },
  Kahoot: {
    label: 'Kahoot!',
    accentText: 'text-violet-700',
    accentBg: 'bg-violet-50',
    accentBorder: 'border-violet-200',
    embedFriendly: false,
    hint: 'Có thể chơi trực tiếp hoặc mở tab mới nếu Kahoot yêu cầu toàn màn hình.',
  },
  Quizizz: {
    label: 'Quizizz',
    accentText: 'text-fuchsia-700',
    accentBg: 'bg-fuchsia-50',
    accentBorder: 'border-fuchsia-200',
    embedFriendly: true,
    hint: 'Hỗ trợ liên kết tham gia Quizizz trực tuyến.',
  },
  Quizlet: {
    label: 'Quizlet',
    accentText: 'text-indigo-700',
    accentBg: 'bg-indigo-50',
    accentBorder: 'border-indigo-200',
    embedFriendly: true,
    hint: 'Tự động chuyển sang chế độ thẻ ghi nhớ / ghép cặp nhúng khi có thể.',
  },
  Blooket: {
    label: 'Blooket',
    accentText: 'text-teal-700',
    accentBg: 'bg-teal-50',
    accentBorder: 'border-teal-200',
    embedFriendly: false,
    hint: 'Khuyến nghị mở tab mới nếu Blooket chặn khung nhúng.',
  },
  Gimkit: {
    label: 'Gimkit',
    accentText: 'text-emerald-700',
    accentBg: 'bg-emerald-50',
    accentBorder: 'border-emerald-200',
    embedFriendly: false,
    hint: 'Hỗ trợ mở trực tiếp hoặc toàn màn hình.',
  },
  Baamboozle: {
    label: 'Baamboozle',
    accentText: 'text-amber-700',
    accentBg: 'bg-amber-50',
    accentBorder: 'border-amber-200',
    embedFriendly: true,
    hint: 'Phù hợp tổ chức chơi ôn tập theo nhóm hoặc cá nhân.',
  },
  Other: {
    label: 'Nền tảng khác',
    accentText: 'text-slate-700',
    accentBg: 'bg-slate-100',
    accentBorder: 'border-slate-200',
    embedFriendly: true,
    hint: 'Hỗ trợ liên kết web trò chơi học tập chuẩn HTTPS.',
  },
};

const PLATFORM_ORDER: LearningGamePlatform[] = [
  'Wordwall',
  'Kahoot',
  'Quizizz',
  'Quizlet',
  'Blooket',
  'Gimkit',
  'Baamboozle',
  'Other',
];

const PRIMARY_GRADE_OPTIONS = ['Khối 10', 'Khối 11', 'Khối 12'];
const EXTRA_GRADE_OPTIONS = ['Khối 6', 'Khối 7', 'Khối 8', 'Khối 9', 'Tất cả khối'];
const SUBJECT_SUGGESTIONS = [
  'Khoa học tự nhiên',
  'Vật lí',
  'Hóa học',
  'Sinh học',
  'Toán học',
  'Tin học',
  'Ngữ văn',
  'Tiếng Anh',
  'Lịch sử & Địa lí',
];

export function detectGamePlatform(rawUrl: string): LearningGamePlatform {
  const lower = String(rawUrl || '').trim().toLowerCase();
  if (!lower) return 'Other';
  if (lower.includes('wordwall.net')) return 'Wordwall';
  if (lower.includes('kahoot.it') || lower.includes('kahoot.com')) return 'Kahoot';
  if (lower.includes('quizizz.com') || lower.includes('wayground.com')) return 'Quizizz';
  if (lower.includes('quizlet.com')) return 'Quizlet';
  if (lower.includes('blooket.com')) return 'Blooket';
  if (lower.includes('gimkit.com')) return 'Gimkit';
  if (lower.includes('baamboozle.com')) return 'Baamboozle';
  return 'Other';
}

export function buildEmbedUrl(
  rawUrl: string,
  platform: LearningGamePlatform,
  explicitEmbedUrl?: string
): string {
  if (explicitEmbedUrl && /^https?:\/\//i.test(explicitEmbedUrl.trim())) {
    return explicitEmbedUrl.trim();
  }
  const clean = String(rawUrl || '').trim();
  if (!clean) return '';

  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    if (platform === 'Wordwall' || host.includes('wordwall.net')) {
      if (pathname.includes('/embed/')) return clean;
      const resourceMatch = pathname.match(/\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:resource|play)\/(\d+)/i);
      if (resourceMatch && resourceMatch[1]) {
        return `https://wordwall.net/embed/${resourceMatch[1]}`;
      }
    }

    if (platform === 'Quizlet' || host.includes('quizlet.com')) {
      if (pathname.endsWith('/embed')) return clean;
      const qMatch = pathname.match(/\/(\d+)(?:\/|$)/);
      if (qMatch && qMatch[1]) {
        return `https://quizlet.com/${qMatch[1]}/match/embed`;
      }
    }
  } catch {
    // Fallback to raw URL if URL parsing fails
  }

  return clean;
}

export const LearningGamesView: React.FC<LearningGamesViewProps> = ({
  currentUser,
  courses,
  isTeacherTestingMode = false,
  onOpenCourse,
}) => {
  const [games, setGames] = useState<LearningGame[]>(() => getStoredLearningGames());
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [platformFilter, setPlatformFilter] = useState<'ALL' | LearningGamePlatform>('ALL');

  // Add / Edit Modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<LearningGame | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formPlatform, setFormPlatform] = useState<LearningGamePlatform>('Wordwall');
  const [platformManuallyChanged, setPlatformManuallyChanged] = useState(false);
  const [formGrade, setFormGrade] = useState('Khối 10');
  const [formSubject, setFormSubject] = useState('Khoa học tự nhiên');
  const [formCourseId, setFormCourseId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Interactive Play Modal state
  const [activeGame, setActiveGame] = useState<LearningGame | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Delete Confirmation Modal state
  const [gameToDelete, setGameToDelete] = useState<LearningGame | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN' && !isTeacherTestingMode;
  const isTeacher = currentUser?.role === 'TEACHER' && !isTeacherTestingMode;
  const canCreateGame = isAdmin || isTeacher;
  const cleanUserId = String(currentUser?.idUser || '').trim().toLowerCase();

  useEffect(() => {
    let active = true;
    const loadGames = async () => {
      if (getStoredLearningGames().length === 0) {
        setLoading(true);
      }
      const list = await fetchLearningGamesFromApi();
      if (active) {
        setGames(list);
        setLoading(false);
      }
    };
    loadGames();

    const handleGamesUpdated = () => {
      setGames(getStoredLearningGames());
    };
    window.addEventListener('lms-games-updated', handleGamesUpdated);
    return () => {
      active = false;
      window.removeEventListener('lms-games-updated', handleGamesUpdated);
    };
  }, []);

  const canManageGame = (game: LearningGame): boolean => {
    if (!canCreateGame) return false;
    if (isAdmin) return true;
    if (!cleanUserId) return false;
    return String(game.authorId || '').trim().toLowerCase() === cleanUserId;
  };

  // Build grade filter pills dynamically including Khối 10, 11, 12 and any used grades
  const availableGrades = useMemo(() => {
    const set = new Set<string>(PRIMARY_GRADE_OPTIONS);
    games.forEach((g) => {
      if (g.grade && g.grade.trim()) {
        set.add(g.grade.trim());
      }
    });
    return Array.from(set);
  }, [games]);

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return games.filter((g) => {
      if (gradeFilter !== 'ALL' && g.grade !== gradeFilter) {
        return false;
      }
      if (platformFilter !== 'ALL' && g.platform !== platformFilter) {
        return false;
      }
      if (q) {
        const hay = [
          g.title,
          g.subject,
          g.authorName,
          g.grade,
          g.platform,
          g.courseTitle || '',
          g.description || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [games, searchQuery, gradeFilter, platformFilter]);

  const openAddModal = () => {
    setEditingGame(null);
    setFormTitle('');
    setFormUrl('');
    setFormPlatform('Wordwall');
    setPlatformManuallyChanged(false);
    setFormGrade('Khối 10');
    setFormSubject('Khoa học tự nhiên');
    setFormCourseId('');
    setFormDescription('');
    setFormError('');
    setEditorOpen(true);
  };

  const openEditModal = (game: LearningGame) => {
    setEditingGame(game);
    setFormTitle(game.title);
    setFormUrl(game.url);
    setFormPlatform(game.platform || detectGamePlatform(game.url));
    setPlatformManuallyChanged(true);
    setFormGrade(game.grade || 'Khối 10');
    setFormSubject(game.subject || 'Khoa học tự nhiên');
    setFormCourseId(game.courseId || '');
    setFormDescription(game.description || '');
    setFormError('');
    setEditorOpen(true);
  };

  const handleUrlChange = (val: string) => {
    setFormUrl(val);
    setFormError('');
    if (!platformManuallyChanged || !editingGame) {
      const detected = detectGamePlatform(val);
      if (val.trim()) {
        setFormPlatform(detected);
      }
    }
  };

  const handleSaveGame = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = formTitle.trim();
    const trimmedUrl = formUrl.trim();
    if (!trimmedTitle) {
      setFormError('Vui lòng nhập tên trò chơi.');
      return;
    }
    if (!trimmedUrl || !/^https?:\/\//i.test(trimmedUrl)) {
      setFormError('Vui lòng nhập đường dẫn URL hợp lệ (bắt đầu bằng https:// hoặc http://).');
      return;
    }

    const linkedCourse = courses.find((c) => c.courseId === formCourseId);
    const computedEmbed = buildEmbedUrl(trimmedUrl, formPlatform);

    setSaving(true);
    setFormError('');
    try {
      await upsertLearningGameApi(
        {
          id: editingGame?.id,
          title: trimmedTitle,
          url: trimmedUrl,
          embedUrl: computedEmbed !== trimmedUrl ? computedEmbed : '',
          platform: formPlatform,
          grade: formGrade.trim() || 'Khối 10',
          subject: formSubject.trim() || 'Khoa học tự nhiên',
          courseId: linkedCourse?.courseId || '',
          courseTitle: linkedCourse?.title || '',
          description: formDescription.trim(),
          authorId: editingGame?.authorId || currentUser?.idUser || 'teacher',
          authorName: editingGame?.authorName || currentUser?.hoTen || 'Giáo viên',
        },
        currentUser
      );

      setGames(getStoredLearningGames());
      setEditorOpen(false);
      notifySyncStatus(
        'success',
        editingGame ? 'Đã cập nhật trò chơi' : 'Đã thêm trò chơi mới',
        `Trò chơi "${trimmedTitle}" đã được đồng bộ lên hệ thống Supabase.`
      );
    } catch (err: any) {
      setFormError(err?.message || 'Không thể lưu trò chơi, vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteGame = async () => {
    if (!gameToDelete) return;
    setDeleting(true);
    try {
      await deleteLearningGameApi(gameToDelete.id, currentUser);
      setGames(getStoredLearningGames());
      notifySyncStatus(
        'success',
        'Đã xóa trò chơi',
        `Trò chơi "${gameToDelete.title}" đã được xóa khỏi kho trò chơi.`
      );
      if (activeGame?.id === gameToDelete.id) {
        setActiveGame(null);
      }
      setGameToDelete(null);
    } catch (err: any) {
      notifySyncStatus('error', 'Không thể xóa trò chơi', err?.message || 'Đã xảy ra lỗi.');
    } finally {
      setDeleting(false);
    }
  };

  const detectedFromUrl = formUrl.trim() ? detectGamePlatform(formUrl) : null;

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
      {/* 1. Top Header Bar */}
      <div className="bg-white rounded-3xl px-5 sm:px-6 py-3 min-h-[68px] border border-slate-200/90 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600 shadow-2xs shrink-0">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <h2 className="text-base sm:text-lg md:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 tracking-tight uppercase truncate">
            KHO TRÒ CHƠI ÔN TẬP KIẾN THỨC
          </h2>
        </div>

        {canCreateGame && (
          <button
            type="button"
            onClick={openAddModal}
            className="px-4 sm:px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-sm transition-all flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Thêm trò chơi</span>
          </button>
        )}
      </div>

      {/* 2. Search & Dropdown Filter Bar */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 border border-slate-200/90 shadow-xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm trò chơi theo tên, môn học, giáo viên..."
              className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 2 Compact Select Dropdowns */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              aria-label="Lọc theo khối lớp"
              className="flex-1 md:flex-initial min-w-[140px] px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer transition-all"
            >
              <option value="ALL">Tất cả khối lớp</option>
              {availableGrades.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>

            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value as 'ALL' | LearningGamePlatform)}
              aria-label="Lọc theo nền tảng"
              className="flex-1 md:flex-initial min-w-[150px] px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer transition-all"
            >
              <option value="ALL">Tất cả nền tảng</option>
              {PLATFORM_ORDER.map((plat) => (
                <option key={plat} value={plat}>
                  {PLATFORM_META[plat].label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3. Games Grid or Empty State Card */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs py-20 px-6 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-500">Đang tải kho trò chơi ôn tập...</p>
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs py-16 sm:py-24 px-6 text-center space-y-3.5">
          <div className="w-16 h-16 rounded-2xl bg-blue-50/90 border border-blue-100/80 shadow-xs text-blue-600 flex items-center justify-center mx-auto">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <h3 className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight pt-1">
            HỆ THỐNG ĐANG CẬP NHẬT ...
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            {games.length === 0
              ? canCreateGame
                ? 'Chưa có trò chơi nào được tạo. Thầy/Cô hãy tạo trò chơi đầu tiên ngay nhé!.'
                : (
                  <>
                    Hệ thống đang cập nhật các hoạt động ôn tập tương tác.
                    <br />
                    Các em vui lòng quay lại sau nhé!
                  </>
                )
              : 'Thử thay đổi từ khóa tìm kiếm hoặc chọn "Tất cả khối lớp" và "Tất cả nền tảng".'}
          </p>
          {games.length === 0 && canCreateGame && (
            <div className="pt-2">
              <button
                type="button"
                onClick={openAddModal}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo trò chơi đầu tiên</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredGames.map((game) => {
            const meta = PLATFORM_META[game.platform] || PLATFORM_META.Other;
            const editable = canManageGame(game);

            return (
              <article
                key={game.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-blue-300 transition-all duration-200 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  {/* Top Row: Platform Label + Teacher Manage Actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className={`inline-flex items-center gap-1.5 text-xs font-extrabold ${meta.accentText}`}>
                      <Gamepad2 className="w-4 h-4 shrink-0" />
                      <span>{meta.label}</span>
                    </div>

                    {editable && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(game)}
                          className="p-1.5 text-slate-400 hover:text-[#0B4D9C] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Chỉnh sửa trò chơi"
                          aria-label={`Chỉnh sửa ${game.title}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setGameToDelete(game)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Xóa trò chơi"
                          aria-label={`Xóa ${game.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Game Title */}
                  <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-2">
                    {game.title}
                  </h3>

                  {/* Clean Unboxed Metadata Line (No Pills) */}
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 font-medium">
                    <span className="font-semibold text-slate-700">{game.grade || 'Khối 10'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{game.subject || 'Khoa học tự nhiên'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate max-w-[160px]">GV: {game.authorName || 'Giáo viên'}</span>
                  </div>

                  {/* Linked Course Reference */}
                  {game.courseTitle && (
                    <div className="pt-0.5">
                      {onOpenCourse && game.courseId ? (
                        <button
                          type="button"
                          onClick={() => onOpenCourse(game.courseId!)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline text-left cursor-pointer max-w-full"
                        >
                          <BookOpen className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Khóa học: {game.courseTitle}</span>
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 max-w-full">
                          <BookOpen className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">Khóa học: {game.courseTitle}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Optional Description */}
                  {game.description && (
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                      {game.description}
                    </p>
                  )}
                </div>

                {/* Bottom Action Row */}
                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveGame(game);
                      setIframeKey((k) => k + 1);
                    }}
                    className="flex-1 py-2 px-4 bg-[#0B4D9C] hover:bg-blue-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-current shrink-0" />
                    <span>Chơi ngay</span>
                  </button>

                  <a
                    href={game.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                    title="Mở link gốc trong tab mới"
                    aria-label={`Mở ${game.title} trong tab mới`}
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">Tab mới</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Add / Edit Game Modal */}
      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !saving && setEditorOpen(false)}
        >
          <div
            className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 sm:px-6 py-4 bg-[#0B4D9C] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Gamepad2 className="w-5 h-5 text-amber-300 shrink-0" />
                <h3 className="text-base sm:text-lg font-bold truncate">
                  {editingGame ? 'Chỉnh sửa link trò chơi' : 'Thêm link trò chơi ôn tập mới'}
                </h3>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditorOpen(false)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Đóng hộp thoại"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGame} className="p-5 sm:p-6 overflow-y-auto space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* URL Input with Auto-Detection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Đường dẫn trò chơi (URL) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    required
                    value={formUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="Dán link Wordwall, Kahoot, Quizizz, Quizlet, Blooket, Gimkit, Baamboozle..."
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0B4D9C]"
                    autoFocus
                  />
                </div>
                {detectedFromUrl && (
                  <p className="mt-1.5 text-xs text-slate-500 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      Tự động nhận diện: <strong className="text-slate-800">{PLATFORM_META[detectedFromUrl].label}</strong>
                      {' · '}
                      {PLATFORM_META[formPlatform].hint}
                    </span>
                  </p>
                )}
              </div>

              {/* Game Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tên trò chơi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ví dụ: Ôn tập phản ứng hóa học - Vòng quay may mắn"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0B4D9C]"
                />
              </div>

              {/* Platform + Grade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nền tảng trò chơi
                  </label>
                  <select
                    value={formPlatform}
                    onChange={(e) => {
                      setFormPlatform(e.target.value as LearningGamePlatform);
                      setPlatformManuallyChanged(true);
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0B4D9C] cursor-pointer"
                  >
                    {PLATFORM_ORDER.map((plat) => (
                      <option key={plat} value={plat}>
                        {PLATFORM_META[plat].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Khối lớp
                  </label>
                  <select
                    value={formGrade}
                    onChange={(e) => setFormGrade(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0B4D9C] cursor-pointer"
                  >
                    {PRIMARY_GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                    {EXTRA_GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject + Linked Course */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Môn học
                  </label>
                  <input
                    type="text"
                    list="lms-game-subjects"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="Nhập hoặc chọn môn học..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0B4D9C]"
                  />
                  <datalist id="lms-game-subjects">
                    {SUBJECT_SUGGESTIONS.map((subj) => (
                      <option key={subj} value={subj} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Gắn với khóa học tương ứng
                  </label>
                  <select
                    value={formCourseId}
                    onChange={(e) => setFormCourseId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0B4D9C] cursor-pointer"
                  >
                    <option value="">-- Không gắn khóa học --</option>
                    {courses.map((c) => (
                      <option key={c.courseId} value={c.courseId}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Mô tả / Hướng dẫn học sinh (tùy chọn)
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ghi chú phạm vi kiến thức, mã PIN phòng chơi (nếu có) hoặc hướng dẫn ngắn..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#0B4D9C] resize-y"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditorOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#0B4D9C] hover:bg-blue-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingGame ? 'Lưu thay đổi' : 'Thêm trò chơi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Play Modal */}
      {activeGame && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setActiveGame(null)}
        >
          <div
            className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Play Header */}
            <div className="px-4 sm:px-6 py-3 bg-[#0B4D9C] text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Gamepad2 className="w-5 h-5 text-amber-300 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold truncate">
                    {activeGame.title}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-blue-100 truncate">
                    {PLATFORM_META[activeGame.platform]?.label || activeGame.platform} · {activeGame.grade} · {activeGame.subject}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIframeKey((k) => k + 1)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  title="Tải lại trò chơi"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Tải lại</span>
                </button>

                <a
                  href={activeGame.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Mở toàn màn hình</span>
                </a>

                <button
                  type="button"
                  onClick={() => setActiveGame(null)}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                  title="Đóng khung trò chơi"
                  aria-label="Đóng khung trò chơi"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Helpful Compatibility Bar */}
            <div className="px-4 sm:px-6 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-600 shrink-0 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#0B4D9C] shrink-0" />
                <span>
                  Nếu màn hình bên dưới không hiển thị do trang nguồn hạn chế nhúng, hãy nhấn{' '}
                  <strong className="text-slate-900">Mở toàn màn hình</strong> để chơi ở tab mới.
                </span>
              </span>
              {activeGame.description && (
                <span className="text-slate-500 font-medium truncate max-w-md">
                  Ghi chú: {activeGame.description}
                </span>
              )}
            </div>

            {/* Embedded Interactive Stage */}
            <div className="flex-1 bg-slate-100 relative min-h-0">
              <iframe
                key={`${activeGame.id}_${iframeKey}`}
                src={buildEmbedUrl(activeGame.url, activeGame.platform, activeGame.embedUrl)}
                title={activeGame.title}
                className="w-full h-full border-0 bg-white"
                allow="autoplay; fullscreen; clipboard-write; encrypted-media"
                allowFullScreen
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {gameToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !deleting && setGameToDelete(null)}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">Xác nhận xóa trò chơi</h4>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                  Bạn có chắc chắn muốn xóa trò chơi{' '}
                  <strong className="text-slate-900">"{gameToDelete.title}"</strong> khỏi hệ thống?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setGameToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDeleteGame}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Xóa trò chơi</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
