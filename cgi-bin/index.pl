#!/usr/bin/perl

use Template;
use CGI;
use Data::Dumper;

my $q = CGI->new;

my $tt = Template->new({
	INCLUDE_PATH => '/opt/sdm/htdocs',
	EVAL_PERL    => 1,
}) || die $Template::ERROR, "\n";


my $loc = {};

my $header = "Content-type: text/html; charset=UTF-8\n\n";
my $output = '';

my $loc = {
	abp_measurements => ["Измерения АД", "ABP measurements"],
	ecg_measurements => ["Измерения ЭКГ", "ECG measurements"],
	monitoring => ["Мониторирование СМАД", "ABP monitoring"],
	period => ["Период", "Period"],
	full_period => ["Сутки", "Full period"],
	day => ["День", "Day"],
	night => ["Ночь", "Night"],
	systolic_abp => ["Систолическое АД", "Systolic blood pressure"],
	diastolic_abp => ["Диастолическое АД", "Diastolic blood pressure"],
	hypertension => ["гиперт.", "Hypertension"],
	hypotension => ["гипот.", "Hypotension"],
	pressure_load => ["Индекс времени", "Pressure load"],
	area_under_curve => ["Индекс площади", "Area under curve"],
	conditions => ["Условия мониторирования", "Monitoring conditions"],
	hospital => ["Госпиталь", "Hospital"],
	ambulatory => ["Амбулатория", "Ambulatory"],
	working_day1 => ["Типичный рабочий день", "Typical working day"],
	day_off1 => ["Типичный день отдыха", "Typical day off"],
	working_day2 => ["Нетипичный рабочий день", "Non-typical working day"],
	day_off2 => ["Нетипичный день отдыха", "Non-typical day off"],
	phys_load => ["Физические нагрузки", "Physical load"],
	heavy => ["Средние", "Heavy"],
	light => ["Легкие", "Light"],
	none => ["Отсутствуют", "None"],
	stress => ["Эмоциональные нагрузки", "Stress"],
	stress_situation => ["Стрессовая ситуация", "Stress"],
	tense_anxiety => ["Легкое нервное напряжение", "Tense anxiety"],
	programming => ["Программирование монитора", "Monitor programming"],
	plug_in => ["Подключите монитор к компьютеру", "Plug in monitor to the computer"],
	execute => ["Запустите ", "Download and execute "],
	dispatcher => ["диспетчер мониторирования", "monitoring dispatcher"],
	parameters => ["Установите параметры мониторирования", "Set monitoring parameters"],
	start_time => ["Время запуска", "Start time"],
	end_time => ["Время окончания", "End time"],
	duration => ["Продолжительность", "Duration"],
	hour1 => ["час", "hour"],
	hour2 => ["часа", "hours"],
	hour10 => ["часов", "hours"],
	minutes => ["минут", "minutes"],
	between_meas => ["между измерениями", "between measurements"],
	active_p => ["Активный период с ", "Active period from "],
	passive_p => ["Пассивный период с ", "Passive period from "],
	till => ["до", "till"],
	indication => ["Индикация результата", "Result indication"],
	program => ["Программировать", "Program monitor"],
	data_load => ["Загрузка данных из монитора", "Download data from monitor"],
	do_load => ["Загрузить данные", "Download data"],
	test_meas => ["Пробный замер", "Test measurement"],
	daily_index => ["Суточный индекс", "Daily index"],
	morning_speed => ["Скорость утреннего повышения", "Morning increase"],
	exit => ["Выход", "Exit"],
	save => ["Сохранить", "Save"],
	hypertension_grade => ["Степень артериальной гипертензии", "Hypertension grade"],
	hg_not_defined => ["Не определена", "Not defined"],
	hg_optimal => ["Оптимальное АД (АДс до 120 мм рт.ст.)", "Optimal"],
	hg_normal => ["Нормальное АД (АДс до 130 мм рт.ст.)", "Normal"],
	hg_high => ["Высокое нормальное АД (АДс до 140 мм рт.ст.)", "High"],
	hg_grade1 => ["Артериальная гипертензия 1 степени (АДс до 160 мм рт.ст.)", "Hypertension grade 1"],
	hg_grade2 => ["Артериальная гипертензия 2 степени (АДс до 180 мм рт.ст.)", "Hypertension grade 2"],
	hg_grade3 => ["Артериальная гипертензия 3 степени (АДс выше 180 мм рт.ст.)", "Hypertension grade 3"],
	clinical_conditions => ["Сопутствующие клинические состояния", "Clinical conditions"],
	diag_cerebrovascular => ["Цереброваскулярные заболевания (ишемический инсульт, геморрагический инсульт, транзиторная ишемическая атака)", "Cerebrovascular desease"],
	diag_cardio => ["Заболевания сердца (инфаркт миокарда, стенокардия, коронарная реваскуляризация, сердечная недостаточность)", "Cardio desease"],
	diag_renal => ["Заболевания почек (диабетическая нефропатия, почечная недостаточность(креатининемия &gt; 2.0 мг/дл))", "Renal desease"],
	diag_vascular => ["Сосудистые заболевания (расслаивающая аневризма аорты, систематическое поражение периферических артерий)", "Vascular desease"],
	diag_retinopathy => ["Гипертоническая ретинопатия (геморрагии или экссудаты, отек соска зрительного нерва)", "Retinopathy"],
	target_organ => ["Поражение органов-мишеней", "Target-organs"],
	diag_hypertrophy => ["Гипертрофия левого желудочка (ЭКГ, ЭХОКГ или рентгенография)", "Hypertrophy"],
	diag_proteinuria => ["Протеинурия и/или гиперкреатинемия (1.2 - 2.0 мг/дл)", "Proteinuria"],
	diag_atherosclerosis => ["Ультразвуковые или рентгенологические признаки атеросклеротической бляшки", "Atherosclerosis"],
	diag_retina => ["Генерализованное или очаговое сужение артерий сетчатки", "Retina"],
	risk_factors => ["Факторы риска", "Risk factors"],
	diag_diabetes => ["Сахарный диабет", "Diabetes"],
	diag_cholesterol => ["Повышенный / пониженный холестерин", "Cholesterol"],
	diag_age => ["Возраст (мужчины &gt; 55 лет, женщины &gt; 65 лет)", "Age (men &gt; 55 years old, women &gt; 65 years old)"],
	diag_parents => ["Наличие у родителей инфаркта миокарда либо мозгового инсульта (у мужчин &lt; 55 лет, у женщин &lt; 65 лет)", "Insult"],
	diag_smoking => ["Курение", "Smoking"],
	diag_inactivity => ["Малоподвижной образ жизни", "Inactivity"],
	risk_grade => ["Степень риска", "Risk grade"],
	insult_risk => ["Риск инсульта или инфаркта миокарда в ближайшие 10 лет", "Insult risk"],
	time_sleep => ["Время отхода ко сну", "Sleep time"],
	time_wake_up => ["Время пробуждения", "Wake up time"],
	time_breakfast => ["Время завтрака", "Breakfast time"],
	time_lunch => ["Время обеда", "Lunch time"],
	time_dinner => ["Время ужина", "Dinner time"],
	test_meas_before => ["Контрольные замеры до мониторирования", "Measurements before monitoring"],
	test_meas_after => ["Контрольные замеры после мониторирования", "Measurements after monitoring"],
	meas_comment => ["Комментарий к измерению", "Monitoring comment"],
	meas_conclusion => ["Заключение", "Conclusion"],
	report_results => ["Результаты суточного мониторирования АД", "Daily monitoring results"],
};

my $lang = CGI::http('Accept-language') =~ /^ru/ ? "ru" : "en";

foreach my $key (keys %$loc) {
	$loc->{$key} = $loc->{$key}[$lang eq 'ru' ? 0 : 1];
}
$loc->{language} = $lang;

$tt->process("index.tpl", $loc, \$output);

print $header.$output;
# print Dumper($loc);
