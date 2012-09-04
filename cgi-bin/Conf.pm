package Conf;

my $conf = {
	DB => 'mssql',
	HTPASSWD => '/opt/apache/cgi-bin/SDM/.htpasswd',
	mysql_user => 'root',
	mysql_pwd => 'mypassword',
	mssql_user => 'SDM',
	mssql_pwd => '123321'
};

sub conf {
	return $conf;
}

1;
