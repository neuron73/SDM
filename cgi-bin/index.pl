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
	measurements => ["Измерения", "Measurements"],
	period => ["Период", "Period"],
	full_period => ["Сутки", "Full period"],
	day => ["День", "Day"],
	night => ["Ночь", "Night"],
	systolic_abp => ["Систолическое АД", "Systolic blood pressure"],
	diastolic_abp => ["Диастолическое АД", "Diastolic blood pressure"],
	hypertension => ["Гипертензия", "Hypertension"],
	hypotension => ["Гипотензия", "Hypotension"],
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
	execute => ["Запустите", "Download and execute"],
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
	test_meas => ["Пробный замер", "Test measurement"]
};

my $lang = CGI::http('Accept-language') =~ /^ru/ ? "ru" : "en";

foreach my $key (keys %$loc) {
	$loc->{$key} = $loc->{$key}[$lang eq 'ru' ? 0 : 1];
}
$loc->{language} = $lang;

$tt->process("index.tpl", $loc, \$output);

print $header.$output;
# print Dumper($loc);
