/* Default home semantic map.
   Edit this file when the object inventory or room model changes. */
let semanticMap = {
  rooms: {
    kitchen: { label: '厨房/饮水机', aliases: ['厨房','饮水机','水吧','台面'] },
    dining: { label: '餐厅/餐桌', aliases: ['餐厅','餐桌','饭桌'] },
    living: { label: '客厅/茶几', aliases: ['客厅','茶几','沙发旁'] },
    study: { label: '书房/办公桌', aliases: ['书房','办公桌','桌上','工作区'] },
    bathroom: { label: '卫生间/洗漱台', aliases: ['卫生间','洗手间','洗漱台','台盆'] },
    cabinet: { label: '储物柜/待客杯具', aliases: ['柜子','储物柜','橱柜','杯柜'] },
    user: { label: '用户位置', aliases: ['我这里','我这边','用户位置','身边','手边'] }
  },
  objects: [
    { id:'glass_cup_01', name:'玻璃杯', icon:'🥛', category:'日常饮水类', room:'dining', location:'餐桌左侧', aliases:['玻璃杯','透明杯','水杯','杯子'], waterSuitable:true, hygiene:'personal_or_family', temp:['cold','warm'], x:34, y:50, note:'适合冷水或温水，位置显眼' },
    { id:'ceramic_cup_01', name:'陶瓷杯', icon:'🍵', category:'日常饮水类', room:'dining', location:'餐桌中央', aliases:['陶瓷杯','瓷杯','水杯','杯子'], waterSuitable:true, hygiene:'family', temp:['hot','warm'], x:55, y:46, note:'可用于热水，但需确认是否为用户常用杯' },
    { id:'mug_01', name:'马克杯', icon:'☕', category:'日常饮水类', room:'dining', location:'餐桌右侧', aliases:['马克杯','大杯子','杯子'], waterSuitable:true, hygiene:'family', temp:['hot','warm'], x:73, y:58, note:'适合热水/温水' },
    { id:'thermos_01', name:'不锈钢保温杯', icon:'🧋', category:'日常饮水类', room:'kitchen', location:'饮水机旁', aliases:['保温杯','不锈钢杯','保温水杯','杯子'], waterSuitable:true, hygiene:'personal', temp:['hot','warm','cold'], x:63, y:70, note:'更适合外出或保温需求' },
    { id:'sports_bottle_01', name:'便携运动水杯', icon:'🍼', category:'日常饮水类', room:'study', location:'书桌右上角', aliases:['运动水杯','水壶','便携杯','杯子'], waterSuitable:true, hygiene:'personal', temp:['cold','warm'], x:76, y:42, note:'适合冷水/温水，通常属于个人物品' },
    { id:'plastic_cup_01', name:'塑料饮水杯', icon:'🥤', category:'日常饮水类', room:'living', location:'茶几左侧', aliases:['塑料杯','塑料饮水杯','塑料水杯','水杯','杯子'], waterSuitable:true, hygiene:'family', temp:['cold'], x:34, y:42, note:'不建议盛热水' },
    { id:'nested_ceramic_set_01', name:'套瓷杯', icon:'🍶', category:'日常饮水类', room:'cabinet', location:'储物柜中层', aliases:['套瓷杯','套杯','瓷杯套装','杯子'], waterSuitable:true, hygiene:'guest', temp:['hot','warm'], x:28, y:52, note:'偏待客或茶饮，不一定是用户当前想要' },
    { id:'mouthwash_cup_01', name:'漱口杯', icon:'🪥', category:'洗漱专用类', room:'bathroom', location:'洗漱台右侧', aliases:['漱口杯','牙刷杯','洗漱杯','杯子'], waterSuitable:false, hygiene:'bathroom', temp:['cold'], x:63, y:58, note:'卫生属性不适合饮用水，系统应拦截' },
    { id:'tea_cup_01', name:'茶杯', icon:'🍵', category:'茶饮专用类', room:'kitchen', location:'厨房台面', aliases:['茶杯','小茶杯','杯子'], waterSuitable:true, hygiene:'family', temp:['hot','warm'], x:42, y:33, note:'适合茶饮或热水，但容量较小' },
    { id:'wine_glass_01', name:'高脚杯/红酒杯', icon:'🍷', category:'酒水饮料类', room:'cabinet', location:'玻璃柜左侧', aliases:['高脚杯','红酒杯','酒杯','杯子'], waterSuitable:false, hygiene:'guest', temp:['cold'], x:52, y:48, note:'酒水场景，不应默认用于日常喝水' },
    { id:'beer_glass_01', name:'啤酒杯', icon:'🍺', category:'酒水饮料类', room:'cabinet', location:'玻璃柜右侧', aliases:['啤酒杯','扎啤杯','酒杯','杯子'], waterSuitable:false, hygiene:'guest', temp:['cold'], x:66, y:48, note:'酒水场景，不应默认用于日常喝水' },
    { id:'coffee_cup_01', name:'咖啡杯', icon:'☕', category:'办公/居家专用', room:'study', location:'书桌左侧', aliases:['咖啡杯','咖啡马克杯','杯子'], waterSuitable:true, hygiene:'personal', temp:['hot','warm'], x:33, y:50, note:'可盛热水，但用途偏咖啡' },
    { id:'office_ceramic_cup_01', name:'陶瓷办公杯', icon:'☕', category:'办公/居家专用', room:'study', location:'显示器旁', aliases:['办公杯','陶瓷办公杯','杯子'], waterSuitable:true, hygiene:'personal', temp:['hot','warm'], x:55, y:66, note:'个人办公杯，适合热水' },
    { id:'paper_cup_01', name:'一次性纸杯', icon:'🥤', category:'一次性/待客类', room:'living', location:'茶几抽屉', aliases:['纸杯','一次性纸杯','杯子'], waterSuitable:true, hygiene:'guest', temp:['hot','warm','cold'], x:67, y:56, note:'可待客，但默认不一定优先' },
    { id:'disposable_plastic_cup_01', name:'一次性塑料杯', icon:'🥤', category:'一次性/待客类', room:'cabinet', location:'储物柜下层', aliases:['一次性塑料杯','塑料一次性杯','杯子'], waterSuitable:true, hygiene:'guest', temp:['cold'], x:82, y:56, note:'不建议盛热水' }
  ]
};
semanticMap.objects.forEach(o => { if (!o.homeRoom) o.homeRoom = o.room; if (!o.homeLocation) o.homeLocation = o.location; });
