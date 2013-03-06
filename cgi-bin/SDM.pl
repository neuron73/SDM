#!/usr/bin/perl

BEGIN {
	$ENV{SYBASE} = '/usr/freetds';
}

my $USER = $ENV{REMOTE_USER};
exit unless $USER;
my $USER_TERMINAL = $1 if $USER =~ /^terminal(\d+)$/;

use strict;
use CGI;
use DBI;
use Data::Dumper;
use JSON;
use POSIX qw(strftime);
use Apache::Htpasswd;
use Conf;
# use MIME::Lite;
my $q = CGI->new;

my $conf = Conf::conf();

my $dbh;
my $TABLE = {};

if ($conf->{DB} eq 'mssql') {
	require DBD::Sybase;
	$TABLE->{terminals} = "[Terminals]";
	$TABLE->{patients} = "[S_pacient]";
	$TABLE->{sessions} = "[s_pac_meas]";
	$TABLE->{measurements} = "[s_meas]";

	$dbh = DBI->connect("dbi:Sybase:server=SDM", $conf->{mssql_user}, $conf->{mssql_pwd}) or die "mssql connect error";
} elsif ($conf->{DB} eq 'mysql') {
	$TABLE->{terminals} = "terminals";
	$TABLE->{patients} = "pacients";
	$TABLE->{sessions} = "pac_meas";
	$TABLE->{measurements} = "meas";

	$dbh = DBI->connect("DBI:mysql:database=SDM2;host=localhost;port=3306", $conf->{mysql_user}, $conf->{mysql_pwd}) or die "mysql connect error";
}


my $result;
my $query = $q->param("query");

my $header = "Content-type: text/plain; charset=UTF-8\n\n";

sub error {
	my $error = shift;
	print JSON->new->encode({error => $error || 1});
	exit;
}

# импорт измерения АД
sub import_result_abp_meas {
	my ($data, $n_terminal, $n_patient, $n_meas, $type) = @_;
	my $time = strftime "%Y-%m-%d %H:%M:%S", localtime;
	my $sth = $dbh->prepare("insert into $TABLE->{sessions} (n_terminal, n_kart, n_meas, type_meas, m_date) values ($n_terminal, $n_patient, $n_meas, '$type', '$time')");
	$sth->execute();
}

# импорт результата мониторирования
sub import_result_abp {
	my ($data, $n_terminal, $n_patient, $n_meas, $type) = @_;
	my @s = split /\r?\n/, $data;
	my $n_points = $s[8];

	my @timeval;
	my @number;
	my @rate;
	my @systolic;
	my @diastolic;

	my $time_start = "$s[11]:$s[10]";
	push @timeval, $time_start;

	for (my $i = 0; $i < $n_points - 1; $i++) {
		my $minute = $s[15 + $i * 2];
		my $hours = $s[16 + $i * 2];
		push @timeval, "$hours:$minute";
	}
	for (my $i = 0; $i < $n_points; $i++) {
		push @number, $s[269 + $i * 5];		# номер измерения
		push @rate, $s[270 + $i * 5];		# пульс
		push @systolic, $s[271 + $i * 5];	# систола
		push @diastolic, $s[272 + $i * 5];	# диастола
		my $flags = $s[273 + $i * 5];		# флаги
	}
	my $sth;
	for (my $i = 0; $i < $n_points; $i++) {
		$sth = $dbh->prepare("insert into $TABLE->{measurements} (n_terminal, n_kart, n_meas, p_off, p_sp, p_dp, p_fp, p_fl_a, p_date, p_time, p_fl_err, p_fl_rst) values ($n_terminal, $n_patient, $n_meas, 0, $systolic[$i], $diastolic[$i], $rate[$i], '', '', '$timeval[$i]', '', '')");
		$sth->execute();
	}

	# if ($n_points > 0) {
		my $time = strftime "%Y-%m-%d %H:%M:%S", localtime;
		$sth = $dbh->prepare("insert into $TABLE->{sessions} (n_terminal, n_kart, n_meas, type_meas, m_date) values ($n_terminal, $n_patient, $n_meas, '$type', '$time')");
		$sth->execute();
	# }
	return $n_points;
}

sub max_meas {
	my ($n_terminal, $n_patient) = @_;
	my $sth = $dbh->prepare("select max(n_meas) from $TABLE->{sessions} where n_terminal = $n_terminal and n_kart = $n_patient");

	$sth->execute();
	my @rows = $sth->fetchrow_array();
	return @rows ? $rows[0] + 1 : 0;
}

sub send_mail {
	my ($email, $id, $password) = @_;

	my $msg = MIME::Lite->new(
		From    => '???',
		To      => $email,
		Subject => 'SDM',
		Type    => 'multipart/mixed',
	);

	$msg->attach(
		Type     => 'TEXT',
		Data     => "Новый пароль для терминала #$id системы дистанционного мониторирования:\nЛогин - terminal$id\nПароль - $password\n",
	);
=pod
	$msg->attach(
		Type     => 'image/gif',
		Path     => 'aaa000123.gif',
		Filename => 'logo.gif',
	);
=cut
	$msg->send;
}

sub format_patients {
	my $sth = shift;
	my @list;
	while (my $row = $sth->fetchrow_hashref()) {
		push @list, {
			name => "$row->{family} $row->{name} $row->{surname}",
			id => $row->{n_kart}
		};
	}
	return \@list;
}

my @info_keys = qw(family name surname burthday policy_series policy_number sex marital_status social_status education employment profession post city street house_number house_korpus house_unit_number house_phone business_phone rost ves bedro talia dispensary_group f_riska por_org_mish sah_diabet stepen_ag soput_zab);

# print "Content-type: text/html; charset=UTF-8\n\n"; print $query; exit;
=pod
if ($q->request_method() eq "POST") {
	print "Content-type: text/plain; charset=UTF-8\n\n";

	my $response = {};
	my $request = JSON->new->decode($q->param('POSTDATA'));
	my $query = $request->{query};

	print Dumper($request);

	print JSON->new->encode($response);
	exit(0);

} els
=cut
if ($query eq "add_meas" && $q->request_method() eq "POST") {
	print "Content-type: text/html; charset=UTF-8\n\n";

	my $SKM_DATA = "/opt/apache/htdocs/med/chrome/data/";
	my $SDM_DATA = "/opt/apache/htdocs/SDM/";

	my $n_terminal = int($q->param("terminal"));

	error("Access Denied") unless $USER eq "admin" or $USER_TERMINAL == $n_terminal;

	my $n_patient = int($q->param("patient"));
	my $type = $q->param("type");
	my $status;
	if ($type =~ /^[\wА-Я]+$/) {
		my $n_meas = max_meas($n_terminal, $n_patient);

		my @files = $q->param("files");
		foreach my $fh (@files) {
			my $ext;
			if ($fh =~ /.*\.([\w\d]+)$/) {
				$ext = $1;
			}
			my $skm_path = $SKM_DATA . $n_terminal . '/';
			mkdir $skm_path;
			mkdir $skm_path .= $n_patient . '/';

			if ($ext eq "hea" or $ext eq "dat") { # physiodb files
				$skm_path .= $n_meas . '.' . $ext;
				open my $fout, ">$skm_path";
				while (<$fh>) {
					print $fout $_;
				}
				close $fout;
			} elsif ($ext eq "DAT") { # SKM files
				open my $fout, ">$skm_path/$n_meas.skm";
				while (<$fh>) {
					print $fout $_;
				}
				close $fout;
				my $ch = "$n_meas.dat 16 200 10 0 0 0 0 ECG";
				open my $fout, ">$skm_path/$n_meas.hea";
				print $fout "$n_meas 3 140\n$ch\n$ch\n$ch";
				close $fout;
				# system("$SKM_DATA/change_byte_order $skm_path/$n_meas.skm $skm_path/$n_meas.dat");
				system("$SKM_DATA/ecg.m $skm_path/$n_meas.skm $skm_path/$n_meas.skmf");
			} elsif ($ext eq "ZIP") { # SDM files
				# сохранить в incoming
				unlink "$SDM_DATA/*.dat";
				my $filename = "$SDM_DATA/tmp.zip";
				open my $fout, ">$filename";
				while (<$fh>) {
					print $fout $_;
				}
				close $fout;

				# распаковать zip
				my $dat = "";
				open UNZIP, "7za x -so -pQZg\\!P\\)g:~A $filename 2>/dev/null |" or die "can't fork: $!";
				while (<UNZIP>) {
				    $dat .= $_;
				}
				close UNZIP or die "bad netstat: $! $?";
				print $dat;
=pod
				system("7za x -pQZg\\!P\\)g:~A $filename");
				opendir(my $dh, $SDM_DATA);
				my @files = grep { /\*.dat$/ } readdir($dh);
				closedir $dh;
				print $files[0];
=cut
			} elsif ($ext eq "txt") { # res_.txt
				my $data = "";
				$data .= $_ while <$fh>;
				my $n_points = import_result_abp($data, $n_terminal, $n_patient, $n_meas, $type);
				$status = "Error: Bad Result" if $n_points < 3;
				print "<html><head><script> window.opener.add_meas_callback($n_terminal, $n_patient, '$status'); window.close(); </script></head></html>";
				exit(0);
			} else {
				$status = "Error: Bad File";
			}
		}

		# TODO: date_monit, number_monitor, time_monit
		my $time = strftime "%Y-%m-%d %H:%M:%S", localtime;
		my $sth = $dbh->prepare("insert into $TABLE->{sessions} (n_terminal, n_kart, n_meas, type_meas, m_date) values ($n_terminal, $n_patient, $n_meas, '$type', '$time')");
		$sth->execute();

		print "<html><head><script> window.opener.add_meas_callback($n_terminal, $n_patient, '$status'); window.close(); </script></head></html>";
	}
	exit(0);
} elsif ($query eq "plan") {
	my $date_start = int($q->param("start"));
	my $date_end = int($q->param("end"));
	my $night_time_start = int($q->param("night_start"));
	my $night_time_end = int($q->param("night_end"));
	my $special_time = int($q->param("special"));

	my @plan;
	$plan[0] = "USB";
	# ФЛАГ ВЫВОДА РЕЗУЛЬТАТОВ НА ИНДИКАЦИЮ ВО ВРЕМЯ МОНИТОРИНГА
	$plan[1] = int($q->param("indication"));
	# КОД ОПЦИЙ РЕАКЦИЙ МОНИТОРА НА ОШИБКИ: всегда константа 3.
	$plan[2] = 3;
	# СТАРТОВОЕ ЗНАЧЕНИЕ ПОРОГА НАГНЕТАНИЯ ДАВЛЕНИЯ В ММ РТ.СТ.: 0, 100 ... 290. (Если 0, то монитор использует стандартное значение.)
	$plan[3] = 0;
	# ШАГ ПОДКАЧКИ ДАВЛЕНИЯ В ММ РТ.СТ.:	0, 20 ... 60. (Если 0, то монитор использует стандартное значение.)
	$plan[4] = 0;
	# ПРЕДЕЛЬНОЕ ЗНАЧЕНИЕ ПОДКАЧКИ ДАВЛЕНИЯ В ММ РТ.СТ.: 0, 20 ... 195. (Если 0, то монитор использует стандартное значение.)
	$plan[5] = 0;
	# МЛАДШИЙ БАЙТ ВРЕМЕНИ НАЧАЛА АКТИВНОГО ПЕРИОДА В МИНУТАХ С НАЧАЛА СУТОК: 0 ... 255
	$plan[6] = ($night_time_end * 60) & 0xFF;
	# СТАРШИЙ БАЙТ ВРЕМЕНИ НАЧАЛА АКТИВНОГО ПЕРИОДА В МИНУТАХ С НАЧАЛА СУТОК: 0 ... 5.
	$plan[7] = ($night_time_end * 60) >> 8;
	# МЛАДШИЙ БАЙТ ВРЕМЕНИ ОКОНЧАНИЯ АКТИВНОГО ПЕРИОДА В МИНУТАХ С НАЧАЛА СУТОК: 0 ... 255.
	$plan[8] = ($night_time_start * 60) & 0xFF;
	# СТАРШИЙ БАЙТ ВРЕМЕНИ ОКОНЧАНИЯ АКТИВНОГО ПЕРИОДА В МИНУТАХ С НАЧАЛА СУТОК: 0 ... 5.
	$plan[9] = ($night_time_start * 60) >> 8;
	my $n = 0;
	while ($date_start <= $date_end) {
		my ($sec, $min, $hour, $mday, $mon, $year, $wday, $yday, $isdst) = localtime($date_start);
		# МИНУТЫ ВРЕМЕНИ ЗАПУСКА ИЗМЕРЕНИЯ НА ТОЧКЕ i: 0 ... 59.
		$plan[10 + $n * 2] = $min;
		# ЧАСЫ ВРЕМЕНИ ЗАПУСКА ИЗМЕРЕНИЯ НА ТОЧКЕ i: 0 ... 23.
		$plan[11 + $n * 2] = $hour;
		my $interval = ($hour >= $special_time && $hour < $night_time_start) ? $q->param("interval_active") : $q->param("interval_passive");
		$date_start += $interval * 60;
		$n++;
	}
	print "Content-Type: text/plain;\n\n" . join("\r\n", @plan) . "\r\n";
	exit(0);
} elsif ($query eq "import_result") {
	print $header;
	my $res = $q->param("result");
	my $n_terminal = int($q->param("terminal"));
	my $n_patient = int($q->param("patient"));
	my $type = $q->param("type");

	my $n_meas = max_meas($n_terminal, $n_patient);
	if ($type eq "АД") {
		import_result_abp($res, $n_terminal, $n_patient, $n_meas, $type);
	} elsif ($type eq "ИАД") {
		import_result_abp_meas($res, $n_terminal, $n_patient, $n_meas, $type);
	}
	$result = {status => "ok", n => $n_meas};

} elsif ($query eq "terminals") {
	print $header;

	my $sth = $dbh->prepare("select n_terminal as id, name_terminal as name, email_terminal as email from $TABLE->{terminals}");
	$sth->execute();

	my @terminals;
	my $row;
	push @terminals, $row while $row = $sth->fetchrow_hashref();
	$result = \@terminals;

} elsif ($query eq "measlist") {
	print $header;

	my $n_terminal = int($q->param("terminal"));

	error("Access Denied") unless $USER eq "admin" or $USER_TERMINAL == $n_terminal;

	my $n_kart = int($q->param("patient"));
	my $sth = $dbh->prepare(
		"select n_meas as id, type_meas as type, file_name_data as record, m_date as date, m_time as time, coment as comment, diagnosis, tst_izm_do as meas_before, tst_izm_pos as meas_after, time_dream as sleep_time, time_eat as dinner_time, date_loaded as request_time, date_sending as review_time, meas_cond as conditions from $TABLE->{sessions} " .
		"where n_terminal = $n_terminal and n_kart = $n_kart order by pac_measID"
	);
	$sth->execute();

	$result = $sth->fetchall_hashref("id");

} elsif ($query eq "meas") {
	print $header;

	my $n_terminal = int($q->param("terminal"));

	error("Access Denied") unless $USER eq "admin" or $USER_TERMINAL == $n_terminal;

	my $n_kart = int($q->param("patient"));
	my $n_meas = int($q->param("meas"));
	if (defined $n_kart and defined $n_terminal and defined $n_meas) {
		my $sth = $dbh->prepare("select p_sp, p_dp, p_fp, p_time, p_fl_err, p_fl_a, measID from $TABLE->{measurements} where n_terminal = $n_terminal and n_kart = $n_kart and n_meas = $n_meas order by measid");
		$sth->execute();
		$result = $sth->fetchall_arrayref();
	}

} elsif ($query eq "save_meas") {

	print $header;

	my $n_terminal = int($q->param("terminal"));
	my $n_kart = int($q->param("patient"));
	my $n_meas = int($q->param("meas"));

	error("Access Denied") unless $USER eq "admin" or $USER_TERMINAL == $n_terminal;

	my $meas_before = $q->param("meas_before");
	my $meas_after = $q->param("meas_after");
	my $sleep_time = $q->param("sleep_time");
	my $dinner_time = $q->param("dinner_time");
	my $request_time = $q->param("request_time");
	my $review_time = $q->param("review_time");
	my $conditions = $q->param("conditions");

	my $query = "update $TABLE->{sessions} set tst_izm_do = '$meas_before', tst_izm_pos = '$meas_after', time_dream = '$sleep_time', time_eat = '$dinner_time', date_loaded = '$request_time', date_sending = '$review_time', meas_cond = '$conditions' where n_terminal = $n_terminal and n_kart = $n_kart and n_meas = $n_meas LIMIT 1";
	my $sth = $dbh->prepare($query);
	my $r = $sth->execute();
	$result = {result => $r ? 1 : 0};

} elsif ($query eq "patients") {
	print $header;

	my $n_terminal = int($q->param("terminal"));

	error("Access Denied") unless $USER eq "admin" or $USER_TERMINAL == $n_terminal;

	my $sth = $dbh->prepare("select n_kart, family, name, surname from $TABLE->{patients} where n_terminal = $n_terminal ORDER BY family");
	$sth->execute();
	$result = format_patients($sth);

} elsif ($query eq "patient") {
	print $header;

	my $n_terminal = int($q->param("terminal"));

	error("Access Denied") unless $USER eq "admin" or $USER_TERMINAL == $n_terminal;

	my $n_kart = int($q->param("patient"));

	my $sth = $dbh->prepare("select * from $TABLE->{patients} where n_terminal = $n_terminal and n_kart = $n_kart");
	$sth->execute();
	$result = $sth->fetchrow_hashref();

} elsif ($query eq "edit_patient") {
	print $header;

	my $n_terminal = int($q->param("terminal"));

	error("Access Denied") unless $USER eq "admin" or $USER_TERMINAL == $n_terminal;

	my $n_kart = int($q->param("patient"));

	my @fields;
	foreach (@info_keys) {
		my $key = "card_info_$_";
		my $value = $q->param($key);
		if (defined($value)) {
			$value =~ s/\'/\\\'/;
			push @fields, "$_ = '$value'";
		}
	}

	my $sth = $dbh->prepare("update $TABLE->{patients} SET " . join(",", @fields) . " where n_terminal = $n_terminal and n_kart = $n_kart");
	print $sth->execute() ? 1 : 0;

} elsif ($query eq "add_patient") {

	print $header;

	my $n_terminal = int($q->param("terminal"));
	my $prefix = "card_info_";
	my $data = {};

	foreach (@info_keys) {
		my $key = $prefix . $_;
		my $value = $q->param($key);
		$value =~ s/\'/\\\'/;
		$data->{$_} = $value;
	}

	error("Access Denied") unless $USER eq "admin" or $USER_TERMINAL == $n_terminal;

	my $sth = $dbh->prepare("select max(n_kart) from $TABLE->{patients} where n_terminal = $n_terminal");
	$sth->execute();
	$data->{n_kart} = ($sth->fetchrow_array())[0] + 1; # max + 1

	my @keys = ("n_terminal");
	my @values = ($n_terminal);
	foreach (keys %$data) {
		push @keys, $_;
		push @values, "'$data->{$_}'";
	}

	# print "insert into $TABLE->{patients} (" . join(",", @keys) . ") VALUES (" . join(",", @values) . ")";
	$sth = $dbh->prepare("insert into $TABLE->{patients} (" . join(",", @keys) . ") VALUES (" . join(",", @values) . ")");
	print $sth->execute() ? $data->{n_kart} : 0;

} elsif ($query eq "auth") {
	
	print $header;
	$result = {user => $USER};

} elsif ($query eq "password_reset") {

	print $header;

	error("Access Denied") unless $USER eq "admin";

	my $auth = new Apache::Htpasswd($conf->{HTPASSWD});
	my $password = "123";
	my $terminal_id = $q->param("terminal");
	$auth->htpasswd("terminal" . $terminal_id, $password, $q->param("reset") eq "1" ? {'overwrite' => 1} : undef);
	# send_mail($email, $terminal_id, $password);
	$result = {ok => 1};

} elsif ($query eq "login_list") {

	print $header;

	error("Access Denied") unless $USER eq "admin";

	my $sth = $dbh->prepare("select n_terminal as id, name_terminal as name, email_terminal as email from $TABLE->{terminals}");
	$sth->execute();

	my $auth = new Apache::Htpasswd($conf->{HTPASSWD});
	my @terminals;
	while (my $row = $sth->fetchrow_hashref()) {
		$row->{pwd} = $auth->fetchPass("terminal" . $row->{id}) ? 1 : 0;
		push @terminals, $row;
	}
	$result = \@terminals;

} elsif ($query eq "create_terminal") {

	print $header;

	error("Access Denied") unless $USER eq "admin";
	my $sth1 = $dbh->prepare("select max(n_terminal) from $TABLE->{terminals}");
	my $res = $sth1->execute();
	my @rows = $sth1->fetchrow_array();
	my $n = @rows ? $rows[0] + 1 : 0;
	my $sth2 = $dbh->prepare("insert into $TABLE->{terminals} (n_terminal, name_terminal, email_terminal) values (?, ?, ?)");
	my $success = $sth2->execute($n, $q->param("name"), $q->param("email"));
	$result = {id => $success ? $n : -1};

} elsif ($query eq "artefact") {

	print $header;

	my $n_terminal = int($q->param("terminal"));
	my $n_patient = int($q->param("patient"));
	my $n_meas = int($q->param("meas"));
	my $n = int($q->param("n"));
	my $error = int($q->param("error")) ? '*' : ' ';

	error("Access Denied") unless $USER eq "admin" or $USER_TERMINAL == $n_terminal;

	my $sth = $dbh->prepare("update $TABLE->{measurements} SET p_fl_a = '$error' where n_terminal = $n_terminal and n_kart = $n_patient and n_meas = $n_meas and measID = $n");
	my $success = $sth->execute();
	$result = {success => $success ? 1 : 0};

} elsif ($query eq "save_comment") {

	print $header;

	my $n_terminal = int($q->param("terminal"));
	my $n_patient = int($q->param("patient"));
	my $n_meas = int($q->param("meas"));
	my $comment = $q->param("comment");

	error("Access Denied") unless $USER_TERMINAL == $n_terminal;

	my $sth = $dbh->prepare("update $TABLE->{sessions} SET coment = ? where n_terminal = $n_terminal and n_kart = $n_patient and n_meas = $n_meas");
	my $success = $sth->execute($comment);
	$result = {success => $success ? 1 : 0};

} elsif ($query eq "send_meas") {

	print $header;

	my $n_terminal = int($q->param("terminal"));
	my $n_patient = int($q->param("patient"));
	my $n_meas = int($q->param("meas"));

	error("Access Denied") unless $USER_TERMINAL == $n_terminal;

	my $sth = $dbh->prepare("update $TABLE->{sessions} SET date_loaded = NOW() where n_terminal = $n_terminal and n_kart = $n_patient and n_meas = $n_meas");
	my $success = $sth->execute();
	$result = {success => $success ? 1 : 0};

} elsif ($query eq "mark_reviewed") {

	print $header;

	my $n_terminal = int($q->param("terminal"));
	my $n_patient = int($q->param("patient"));
	my $n_meas = int($q->param("meas"));

	error("Access Denied") unless $USER eq "admin";

	my $sth = $dbh->prepare("update $TABLE->{sessions} SET date_sending = NOW() where n_terminal = $n_terminal and n_kart = $n_patient and n_meas = $n_meas");
	my $success = $sth->execute();
	$result = {success => $success ? 1 : 0};

} elsif ($query eq "mark_viewed") {

	print $header;

	my $n_patient = int($q->param("patient"));
	my $n_meas = int($q->param("meas"));

	error("Access Denied") if $USER eq "admin";

	my $sth = $dbh->prepare("update $TABLE->{sessions} SET date_loaded = NOW() where n_terminal = $USER_TERMINAL and n_kart = $n_patient and n_meas = $n_meas");
	my $success = $sth->execute();
	$result = {success => $success ? 1 : 0};

} elsif ($query eq "get_requests") {

	print $header;

	my $condition;

	if ($USER eq "admin") {
		$condition = "NOT ISNULL(date_loaded) AND ISNULL(date_sending)";
	} else {
		$condition = "$TABLE->{sessions}.n_terminal = $USER_TERMINAL AND NOT ISNULL(date_sending) AND date_loaded < date_sending";
	}

	my $sth = $dbh->prepare("select $TABLE->{sessions}.n_terminal, $TABLE->{sessions}.n_kart, n_meas, family, name, surname from $TABLE->{sessions} INNER JOIN $TABLE->{patients} ON $TABLE->{sessions}.n_terminal = $TABLE->{patients}.n_terminal AND $TABLE->{sessions}.n_kart = $TABLE->{patients}.n_kart WHERE $condition");
	my $success = $sth->execute();

	my @list;

	while (my $row = $sth->fetchrow_hashref()) {
		push @list, {
			name => "$row->{family} $row->{name} $row->{surname}",
			terminal => $row->{n_terminal},
			patient => $row->{n_kart},
			meas => $row->{n_meas}
		};
	}

	$result = \@list;

} elsif ($query eq "save_conclusion") {

	print $header;

	my $n_terminal = int($q->param("terminal"));
	my $n_patient = int($q->param("patient"));
	my $n_meas = int($q->param("meas"));
	my $conclusion = $q->param("conclusion");

	error("Access Denied") unless $USER eq "admin";

	my $sth = $dbh->prepare("update $TABLE->{sessions} SET diagnosis = ? where n_terminal = $n_terminal and n_kart = $n_patient and n_meas = $n_meas");
	my $success = $sth->execute($conclusion);
	$result = {success => $success ? 1 : 0};

} else {

	print $header;
	error("Bad Request");

}

print JSON->new->encode($result);

