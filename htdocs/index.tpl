<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
	<head>
		<meta http-equiv="content-type" content="text/html; charset=UTF-8" /> 
		<script src="lib/require.js"></script>
		<style>
			body {
				margin: 0px;
				padding: 0px;
				font-family: monospace;;
				font-size: 14px;
				height: 100%;
				width: 100%;
			}

			table#main {
				overflow: hidden;
			}

			.navigation {
				width: 100%;
				border-bottom: 1px solid gray;
			}

			.navigation td {
				padding: 8px;
			}

			#terminals {
				overflow: auto;
				margin: 4px 8px;
				width: 350px;
			}

			#new_measurements {
				overflow: auto;
				margin: 4px 8px;
				width: 350px;
			}

			#patients {
				overflow: auto;
				margin: 4px 8px;
				width: 350px;
			}

			#card {
				margin: 4px 8px;
			}

			.delimiter {
				margin: 10px 0px;
				height: 1px;
				overflow: hidden;
				border-top: 1px solid #555;
			}

			.meas_submenu {
				padding: 5px;
			}

			.active_meas {
				background-color: #f2f2f2;
				padding: 3px 0px;
				margin: 3px 0px;
			}

			#meas_list div {
				padding-left: 10px;
			}

			#abp_meas_list {
				overflow-y: scroll;
				width: 260px;
				margin: 10px;
			}

			#abp_meas_list td {
				cursor: default;
			}

			#abp_meas_list .active {
				background-color: #dddde5;
			}

			a {
				color: black;
			}

			a:hover {
				color: red;
			}

			input[type="text"], textarea {
				border: 1px solid gray;
				padding: 2px 4px;
				margin: 1px;
			}

			input[type="text"]:focus, textarea:focus {
				border: 2px solid #444 !important;
				margin: 0px !important;
				background-color: white !important;
			}

			textarea.disabled {
				border: 1px solid gray !important;
				margin: 1px !important;
			}

			input.empty {
				background-color: #f8f8f8;
			}

			select {
				margin: 1px 0px;
			}

			button, input[type="submit"] {
				padding: 3px 25px;
				margin: 2px 0px;
			}

			table.report {
				width: 800px;
				border-top: 1px solid black;
				border-left: 1px solid black;
			}

			table.report td {
				vertical-align: top;
				padding: 3px 10px;
				border-bottom: 1px solid black;
				border-right: 1px solid black;
			}

			#report_analysis table td {
				text-align: center;
			}
		</style>
		<script>
			(function() {
				var $ = require("utils", "web", "json");
				var SDM = require("interface", "loc");

				Math.sum = function(A) {
					var sum = 0;
					for (var i = 0; i < A.length; i++) {
						sum += A[i];
					}
					return sum;
				};

				Math.mean = function(A) {
					return Math.sum(A) / A.length;
				};

				Math.vector = {
					min: function(A) {
						var min;
						for (var i = 0; i < A.length; i++) {
							if (min == null || A[i] < min)
								min = A[i];
						}
						return min;
					},
					max: function(A) {
						var max;
						for (var i = 0; i < A.length; i++) {
							if (max == null || A[i] > max)
								max = A[i];
						}
						return max;
					}
				};

				// standard deviation
				Math.std = function(values) {
					var sum = 0;
					var count = values.length;
					for (var i = 0; i < count; i++) {
						sum += values[i];
					}
					var avg = sum / count;
					var sum_square_diff = 0;
					for (var i = 0; i < count; i++) {
						var diff = values[i] - avg;
						sum_square_diff += diff * diff;	
					}
					return Math.sqrt(sum_square_diff / (count - 1));
				};

				window.loc = new SDM.Loc("[% language %]");
				window.UI = new SDM.Interface("/cgi-bin/SDM/SDM.pl", "/cgi-bin/");

				window.onresize = 		$.F(UI, UI.event, ["resize"]);
				window.add_meas_callback = 	$.F(UI, UI.event, ["add_meas_callback"]);
				window.add_patient = 		$.F(UI, UI.event, ["add_patient"]);
				window.card_monitoring_update =	$.F(UI, UI.event, ["card_monitoring_update"]);
				window.update_analysis = 	$.F(UI, UI.event, ["update_analysis"]);
				window.save_comment = $.F(UI, UI.event, ["save_comment"]);
				window.save_conclusion = $.F(UI, UI.event, ["save_conclusion"]);
				window.grade_update = $.F(UI, UI.event, ["grade_update"]);

				window.add_abp_measurement = function() {
					var terminal = window.UI.navigation.get("terminal");
					var patient = window.UI.navigation.get("patient");
					var response = window.UI.post({
						query: "import_result",
						// result : data,
						terminal: terminal,
						patient: patient,
						type: "ИАД"
					});
					window.UI.event("add_meas_callback");
					return terminal + "-" + patient + "-" + response.n;
				}

				window.toggle_auth = function(exit) {
					$.toggle(!exit, "auth_user_name");
					$.toggle(exit, "auth_user_logout");
				}

				window.onload = function() {
					$.every($.$$(".dispatcher"), function(a) {
						a.href = "monitor.exe?t=" + $.now();
					});
					window.UI.init();
				}
			})();
		</script>
	</head>
	<body>
		<table id="main" cellpadding="0" cellspacing="0">
			<tr>
				<td id="header" colspan="4" style="height: 30px">
					<table class="navigation" width="100%" cellpadding="0" cellspacing="0">
						<tr>
							<td>
								<div id="navigation"></div>
							</td>
							<td id="auth_user" onmouseover="toggle_auth(true)" onmouseout="toggle_auth(false)" style="width: 110px; background-color: #eee; text-align: center">
								<div id="auth_user_name"></div>
								<div id="auth_user_logout" style="display:none"><a href="" onclick="UI.logout(); return false;">[% exit %]</a></div>
							</td>
						</tr>
					</table>
				</td>
			</tr>
			<tr>
				<td valign="top">
					<table cellpadding="0" cellspacing="0" height="100%">
						<tr>
							<td valign="top" id="tab_terminals">
								<div id="terminals"></div>
							</td>
							<td valign="top" id="tab_patients">
								<div id="patients"></div>
							</td>
							<td valign="top" id="tab_menu" style="border-right: 1px solid gray">
								<div id="card" style="display: none">
									<div id="patient_name" style="display: none"></div>
									<div id="card_menu" style="padding: 10px 0px 20px; border-bottom: 1px solid gray; margin-bottom: 15px"></div>
									<div id="monitoring_list_title">[% monitoring %]:</div>
									<div id="monitoring_list" style="padding: 10px 0px 20px"></div>
									<div id="abpm_list_title" style="border-top: 1px solid gray; padding-top: 10px;">[% abp_measurements %]:</div>
									<div id="abpm_list" style="padding: 10px 0px 20px"></div>
									<div id="ecg_list_title" style="border-top: 1px solid gray; padding-top: 10px;">[% ecg_measurements %]:</div>
									<div id="ecg_list" style="padding: 10px 0px 20px"></div>
									<div>
										<!--<a id="add_meas_link" href="" onclick="add_meas(true); return false;">Добавить измерение</a>-->
									</div>
								</div>
							</td>
							<td valign="top">
								<div id="card_data" style="display: none">
									<div id="card_meas">
										<div id="card_meas_abp">
											<table cellpadding="0" cellspacing="0" width="100%">
												<tr>
													<td valign="top">
														<canvas id="abp_canvas"></canvas>
														<div id="abp_analyze" style="padding: 10px; display:none">
															<table>
																<tr>
																	<td width="200" valign="top" align="center">
																		[% period %]:
																		<select id="abp_analyze_period" onchange="update_analysis()">
																			<option value="full">[% full_period %]</option>
																			<option value="day">[% day %]</option>
																			<option value="night">[% night %]</option>
																		</select>
<br />
																	</td>
																	<td>
																		<div id="abp_analyze_table1" style="margin: 0px 0px 5px"></div>
																	</td>
																</tr>
																<tr>
																	<td>&nbsp;</td>
																	<td>
																		<div id="abp_analyze_table2" style="margin: 0px 0px 5px"></div>
																		<table border="1" cellpadding="5" cellspacing="0" width="580" class="analysis">
																			<tr>
																				<td rowspan="2">&nbsp;</td>
																				<td align="center" colspan="2">[% systolic_abp %]</td>
																				<td align="center" colspan="2">[% diastolic_abp %]</td>
																			</tr>
																			<tr>
																				<td align="center">[% hypertension %]</td>
																				<td align="center">[% hypotension %]</td>
																				<td align="center">[% hypertension %]</td>
																				<td align="center">[% hypotension %]</td>
																			</tr>
																			<tr>
																				<td>[% pressure_load %]</td>
																				<td align="center" id="abp_blood_pressure_load_systolic_hyper"></td>
																				<td align="center" id="abp_blood_pressure_load_systolic_hypo"></td>
																				<td align="center" id="abp_blood_pressure_load_diastolic_hyper"></td>
																				<td align="center" id="abp_blood_pressure_load_diastolic_hypo"></td>
																			</tr>
																			<tr>
																				<td>[% area_under_curve %]</td>
																				<td align="center" id="abp_area_under_curve_systolic_hyper"></td>
																				<td align="center" id="abp_area_under_curve_systolic_hypo"></td>
																				<td align="center" id="abp_area_under_curve_diastolic_hyper"></td>
																				<td align="center" id="abp_area_under_curve_diastolic_hypo"></td>
																			</tr>
																			<tr>
																				<td>[% daily_index %]</td>
																				<td align="center" colspan="2" id="daily_index_systolic"></td>
																				<td align="center" colspan="2" id="daily_index_diastolic"></td>
																			</tr>
																			<tr>
																				<td>[% morning_speed %]</td>
																				<td align="center" colspan="2" id="morning_speed_systolic"></td>
																				<td align="center" colspan="2" id="morning_speed_diastolic"></td>
																			</tr>
																		</table>
																	</td>
																</tr>
															</table>
														</div>
														<div id="abp_monitoring" style="margin: 10px; display:none">
															<table width="100%">
																<tr>
																	<td width="50%">
																		<table>
																			<tr>
																				<td>
																					[% conditions %]:
																				</td>
																				<td>
																					<select id="abp_monitoring_type">
																						<option value="0"></option>
																						<option value="1">[% hospital %]</option>
																						<option value="2">[% ambulatory %]</option>
																						<option value="3">[% working_day1 %]</option>
																						<option value="4">[% day_off1 %]</option>
																						<option value="5">[% working_day2 %]</option>
																						<option value="6">[% day_off2 %]</option>
																					</select>
																					<span id="abp_monitoring_type_s"></span>
																				</td>
																			</tr>
																			<!--
																			<tr>
																				<td>
																					[% phys_load %]:
																				</td>
																				<td>
																					<select id="abp_monitoring_physical">
																						<option value="0"></option>
																						<option value="1">[% heavy %]</option>
																						<option value="2">[% light %]</option>
																						<option value="3">[% none %]</option>
																					</select>
																				</td>
																			</tr>
																			<tr>
																				<td>
																					[% stress %]:
																				</td>
																				<td>
																					<select id="abp_monitoring_emo">
																						<option value="0"></option>
																						<option value="1">[% stress_situation %]</option>
																						<option value="2">[% tense_anxiety %]</option>
																						<option value="3">[% none %]</option>
																					</select>
																				</td>
																			</tr>
																			-->
																			<tr>
																				<td>
																					[% time_sleep %]:
																				</td>
																				<td>
																					<span id="time_sleep_s"></span>
																					<input type="text" id="time_sleep"></input>
																				</td>
																			</tr>
																			<tr>
																				<td>
																					[% time_wake_up %]:
																				</td>
																				<td>
																					<span id="time_wake_up_s"></span>
																					<input type="text" id="time_wake_up"></input>
																				</td>
																			</tr>
																			<tr>
																				<td>
																					[% time_breakfast %]:
																				</td>
																				<td>
																					<span id="time_breakfast_s"></span>
																					<input type="text" id="time_breakfast"></input>
																				</td>
																			</tr>
																			<tr>
																				<td>
																					[% time_lunch %]:
																				</td>
																				<td>
																					<span id="time_lunch_s"></span>
																					<input type="text" id="time_lunch"></input>
																				</td>
																			</tr>
																			<tr>
																				<td>
																					[% time_dinner %]:
																				</td>
																				<td>
																					<span id="time_dinner_s"></span>
																					<input type="text" id="time_dinner"></input>
																				</td>
																			</tr>
																		</table>
																	</td>
																	<td valign="top" style="padding-top: 30px">
																		[% test_meas_before %]: <br />
																		<span id="meas_before_1_s"></span>
																		<input type="text" id="meas_before_1"></input> <br />
																		<span id="meas_before_2_s"></span>
																		<input type="text" id="meas_before_2"></input> <br />
																		<span id="meas_before_3_s"></span>
																		<input type="text" id="meas_before_3"></input> <br />
																		<br />
																		[% test_meas_after %]: <br />
																		<span id="meas_after_1_s"></span>
																		<input type="text" id="meas_after_1"></input> <br />
																		<span id="meas_after_2_s"></span>
																		<input type="text" id="meas_after_2"></input> <br />
																		<span id="meas_after_3_s"></span>
																		<input type="text" id="meas_after_3"></input> <br />
																	</td>
																</tr>
																<tr>
																	<td colspan="2">
																		<button id="monitoring_edit" onclick="window.UI.monitoring_edit(true)">Изменить</button>
																		<button id="monitoring_save" onclick="window.UI.monitoring_save()">Сохранить</button>
																	</td>
																</tr>
															</table>
														</div>
														<div id="abp_comment" style="display:none; padding: 10px">
															[% meas_comment %]:
															<textarea id="abp_monitoring_comment" style="width: 100%; height: 385px;"></textarea>
															<br />
															<button id="abp_monitoring_comment_save" onclick="save_comment()">[% save %]</button>
														</div>
														<div id="abp_conclusion" style="display:none; padding: 10px">
															[% meas_conclusion %]:
															<textarea id="abp_monitoring_conclusion" style="width: 100%; height: 385px;"></textarea>
															<br />
															<button id="abp_monitoring_conclusion_save" onclick="save_conclusion()">[% save %]</button>
														</div>
														<div id="abp_report" style="display:none; padding: 10px; width: 1200px">
															<h2>[% report_results %]</h2>
															<div id="report_info"></div>
															<h3>[% meas_comment %]:</h3>
															<div id="report_comment"></div>
															<br />
															<br />
															<br />
															<div id="report_analysis"></div>
															<br />
															<br />
															<canvas id="report_canvas" width="500" height="500"></canvas>
															<h3>[% meas_conclusion %]:</h3>
															<div id="report_diagnosis"></div>
														</div>
													</td>
													<td valign="top">
														<div style="border-left: 1px solid gray">
															<div id="abp_meas_list"></div>
														</div>
													</td>
												</tr>
											</table>
										</div>
										<div id="card_meas_ecg" style="display: none">
											ЭКГ
										</div>
										<div id="card_meas_abpm" style="display: none">
											ИАД
										</div>
									</div>
									<div id="card_info" style="display: none; padding: 20px;">
										card_info
									</div>
									<div id="card_history" style="display: none; padding: 20px;">
										card_history
									</div>
									<div id="card_diagnosis" style="display: none; padding: 20px;">
										[% hypertension_grade %]:
										<select id="hypertension_grade" onchange="grade_update()">
											<option value="">[% hg_not_defined %]</option>
											<option value="-2">[% hg_optimal %]</option>
											<option value="-1">[% hg_normal %]</option>
											<option value="0">[% hg_high %]</option>
											<option value="1">[% hg_grade1 %]</option>
											<option value="2">[% hg_grade2 %]</option>
											<option value="3">[% hg_grade3 %]</option>
										</select>
										<br />
										<br />
										<b>[% clinical_conditions %]:</b>
										<hr />
										<input type="checkbox" onchange="grade_update()" id="ah_cerebrovascular">[% diag_cerebrovascular %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_cardio">[% diag_cardio %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_renal">[% diag_renal %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_vascular">[% diag_vascular %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_retinopathy">[% diag_retinopathy %]</input>
										<br />
										<br />
										<b>[% target_organ %]:</b>
										<hr />
										<input type="checkbox" onchange="grade_update()" id="ah_hypertrophy">[% diag_hypertrophy %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_proteinuria">[% diag_proteinuria %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_atherosclerosis">[% diag_atherosclerosis %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_retina">[% diag_retina %]</input>
										<br />
										<br />
										<b>[% risk_factors %]:</b>
										<hr />
										<input type="checkbox" onchange="grade_update()" id="ah_diabetes">[% diag_diabetes %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_cholesterol">[% diag_cholesterol %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_age">[% diag_age %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_parents">[% diag_parents %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_smoking">[% diag_smoking %]</input>
										<br />
										<input type="checkbox" onchange="grade_update()" id="ah_inactivity">[% diag_inactivity %]</input>

										<br>
										<br>
										<hr />

										<b>[% risk_grade %]: <span id="hypertension_risk"></span></b> <br />
										[% insult_risk %]: <span id="insult_risk"></span>
									</div>
									<div id="card_monitor" style="display: none; padding: 0px 20px;">
										<div>
											<h3>[% programming %]</h3>

											<table>
												<tr>
													<td valign="top">1.</td>
													<td>
														[% plug_in %]
													</td>
												</tr>
												<tr>
													<td valign="top">2.</td>
													<td>
														[% execute %]<a class="dispatcher" href="">[% dispatcher %]</a>
													</td>
												</tr>
												<tr>
													<td valign="top">3.</td>
													<td>
														[% parameters %]:
														<table>
															<tr>
																<td width="400">
																	[% start_time %]:
																</td>
																<td>
																	<span id="card_monitor_time_start"></span>
																</td>
															</tr>
															<tr>
																<td>
																	[% end_time %]:
																</td>
																<td>
																	<span id="card_monitor_time_end"></span>
																</td>
															</tr>
															<tr>
																<td>
																	[% duration %]:
																</td>
																<td>
																	<select id="card_monitor_duration" onchange="card_monitoring_update()">
																		<option value="1">1 [% hour1 %]</option>
																		<option value="2">2 [% hour2 %]</option>
																		<option value="3">3 [% hour2 %]</option>
																		<option value="4">4 [% hour2 %]</option>
																		<option value="5">5 [% hour10 %]</option>
																		<option value="6">6 [% hour10 %]</option>
																		<option value="7">7 [% hour10 %]</option>
																		<option value="8">8 [% hour10 %]</option>
																		<option value="9">9 [% hour10 %]</option>
																		<option value="10">10 [% hour10 %]</option>
																		<option value="11">11 [% hour10 %]</option>
																		<option value="12">12 [% hour10 %]</option>
																		<option value="13">13 [% hour10 %]</option>
																		<option value="14">14 [% hour10 %]</option>
																		<option value="15">15 [% hour10 %]</option>
																		<option value="16">16 [% hour10 %]</option>
																		<option value="17">17 [% hour10 %]</option>
																		<option value="18">18 [% hour10 %]</option>
																		<option value="19">19 [% hour10 %]</option>
																		<option value="20">20 [% hour10 %]</option>
																		<option value="21">21 [% hour1 %]</option>
																		<option value="22">22 [% hour2 %]</option>
																		<option value="23">23 [% hour2 %]</option>
																		<option value="24">24 [% hour2 %]</option>
																	</select>
																</td>
															</tr>
															<tr>
																<td>
																	[% active_p %]<span id="card_monitor_active_start"></span> [% till %] <span id="card_monitor_active_end"></span>
																</td>
																<td>
																	<select id="card_monitor_interval_active" name="interval_active" onchange="card_monitoring_update()">
																		<option value="15">15 [% minutes %]</option>
																		<option value="30">30 [% minutes %]</option>
																		<option value="45">45 [% minutes %]</option>
																		<option value="60">60 [% minutes %]</option>
																	</select>
																	[% between_meas %]
																</td>
															</tr>
															<tr>
																<td>
																	Пассивный период с <span id="card_monitor_passive_start"></span> [% till %] <span id="card_monitor_passive_end"></span>
																</td>
																<td>
																	<select id="card_monitor_interval_passive" name="interval_passive" onchange="card_monitoring_update()">
																		<option value="15">15 [% minutes %]</option>
																		<option value="30">30 [% minutes %]</option>
																		<option value="45">45 [% minutes %]</option>
																		<option value="60">60 [% minutes %]</option>
																	</select>
																	[% between_meas %]
																</td>
															</tr>
															<tr>
																<td>
																	[% indication %]:
																</td>
																<td>
																	<input type="checkbox" id="card_monitor_indication" name="indication" checked="checked" onchange="card_monitoring_update()"></input>
																</td>
															</tr>
															<!--
															<div>
																Нестандартная подкачка: ???????
															</div>
															-->
														</table>
													</td>
												</tr>
<!--
												<tr>
													<td valign="top">2.</td>
													<td>
														<a id="card_monitor_plan_download" target="_blank" href="/cgi-bin/plan_.txt">Скачать план мониторирования</a> и сохранить его в C:\plan_.txt
													</td>
												</tr>
												<tr>
													<td valign="top">3.</td>
													<td>Запустить программу C:\SDM_COM.exe</td>
												</tr>
-->
												<tr>
													<td>4.</td>
													<td>
														<button onclick="window.UI.monitor_prog()">[% program %]</button>
													</td>
												</tr>
											</table>
										</div>

										<br />
										<br />

										<div>
											<h3>[% data_load %]</h3>
											<!--
											<form method="POST" action="/cgi-bin/SDM/SDM.pl" target="_blank" enctype="multipart/form-data">
												<input name="query" value="add_meas" type="hidden"></input>
												<input name="terminal" id="add_meas_terminal" type="hidden"></input>
												<input name="patient" id="add_meas_patient" type="hidden"></input>
												<input name="type" id="add_meas_type" type="hidden"></input>
											-->
												<table>
													<tr>
														<td valign="top">1.</td>
														<td>
															[% plug_in %]
														</td>
													</tr>
													<tr>
														<td valign="top">2.</td>
														<td>
															[% execute %]<a class="dispatcher" href="">[% dispatcher %]</a>
														</td>
													</tr>
													<!--
													<tr>
														<td valign="top">1.</td>
														<td>Запустить программу C:\SDM_READ.exe</td>
													</tr>
													<tr>
														<td valign="bottom">2.</td>
														<td>
															Выбрать и загрузить файл C:\res_.txt с результатами мониторирования:
															<input name="files" id="add_meas_input" type="file" multiple="multiple" onchange="UI.event('add_meas_update')"></input>
														</td>
													</tr>
													-->
													<tr>
														<td>3.</td>
														<td>
															<!--<input type="submit" onclick="UI.event('add_meas_update')" value="Загрузить"></input>-->
															<button onclick="window.UI.monitor_read()">[% do_load %]</button>
														</td>
													</tr>
												</table>
											<!--
											</form>
											-->
										</div>

										<div id="monitor-container"></div>
									</div>
									<div id="card_test" style="display: none;">
										[% test_meas %]
									</div>
								</div>
								<div id="terminal_info" style="display:none;">
									<div id="new_measurements"></div>
									<!--<a href="" onclick="add_patient(); return false;">Добавить карточку</a>-->
								</div>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>
