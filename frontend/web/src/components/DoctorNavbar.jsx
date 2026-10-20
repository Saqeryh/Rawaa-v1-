import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  SlidersHorizontal, 
  Search, 
  ArrowLeft, 
  ArrowRight 
} from 'lucide-react'; // أو استخدام أيقونات Tabler حسب المثبت لديك

export default function DoctorNavbar({ 
  activeTab, 
  setActiveTab, 
  onOpenSimulation, 
  onBackToLanding, 
  searchQuery, 
  setSearchQuery,
  isRtl = true 
}) {
  const navItems = [
    { id: 'overview', label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'patients', label: 'طابور الفرز', icon: Users },
  ];

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#e9e8f0] bg-white/95 px-6 py-3 backdrop-blur-md">
      {/* 1. شعار رَواء وبيانات الطبيب */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-[#7b61ff] font-bold text-xl text-white shadow-md shadow-[#7b61ff]/20">
          ر
        </div>
        <div>
          <div className="text-sm font-bold text-[#1e1b2e]">رَواء | ThrombiX</div>
          <div className="text-[11px] text-[#9f9baa]">بوابة الطبيب المتابع</div>
        </div>
      </div>

      {/* 2. شريط التنقل بنمط الكبسولة العائمة (Nav Pills) */}
      <nav className="flex items-center gap-1.5 rounded-full border border-[#e9e8f0] bg-[#f2f3f7]/60 p-1 shadow-sm">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-[#7b61ff] text-white shadow-md shadow-[#7b61ff]/25'
                  : 'text-[#69657b] hover:bg-[#ece8ff] hover:text-[#7b61ff]'
              }`}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* زر محاكي المستشعرات */}
        <button
          onClick={onOpenSimulation}
          className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-[#69657b] hover:bg-[#ece8ff] hover:text-[#7b61ff] transition-all"
        >
          <SlidersHorizontal size={15} className="text-[#7b61ff]" />
          <span>محاكي المستشعرات</span>
        </button>
      </nav>

      {/* 3. أدوات البحث، البروفايل، وزر الرجوع */}
      <div className="flex items-center gap-4">
        {/* حقل البحث */}
        <div className="relative flex items-center">
          <Search size={14} className="absolute start-3 text-[#9f9baa]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث عن مريض..."
            className="w-44 rounded-full border border-[#e9e8f0] bg-[#f2f3f7] py-1.5 pe-4 ps-9 text-xs text-[#1e1b2e] outline-none transition-all focus:w-60 focus:border-[#7b61ff]"
          />
        </div>

        {/* معلومات الطبيب */}
        <div className="flex items-center gap-2.5 border-s border-[#e9e8f0] ps-4">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#ece8ff] text-xs font-bold text-[#7b61ff]">
            د
          </div>
          <div className="hidden text-start md:block">
            <div className="text-xs font-bold text-[#1e1b2e]">د. اسماء </div>
            <div className="text-[10px] text-[#9f9baa]">استشارية أمراض الدم</div>
          </div>
        </div>

        {/* زر العودة للبوابة */}
        <button
          onClick={onBackToLanding}
          title="العودة للبوابة الرئيسية"
          className="flex size-8 items-center justify-center rounded-xl bg-[#ece8ff] text-[#7b61ff] transition-all hover:bg-[#7b61ff] hover:text-white"
        >
          {isRtl ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
        </button>
      </div>
    </header>
  );
}