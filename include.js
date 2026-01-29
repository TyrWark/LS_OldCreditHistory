(function () {
	'use strict';

	const getAccountId = () => window.merchantos?.account?.id;
	const getCustomerId = () => new URL(window.location.href).searchParams.get('id');
	const getCreditAccountId = () => window.customerCreditInfo?.creditAccoutnID ?? window.customerCreditInfo?.creditAccountID;
	const getCreditAccountRef = () => {
		const raw = getCreditAccountId();
		if (!raw) return null;
		const str = String(raw);
		return str.startsWith('ls-retail_') ? str : `ls-retail_${str}`;
	};
	const extractSaleId = (transactionRef) => {
		if (!transactionRef) return null;
		const parts = String(transactionRef).split('_');
		const last = parts[parts.length - 1];
		return /^\d+$/.test(last) ? last : null;
	};

	const addTableToggle = (table, limit = 15, storageKey) => {
		const rows = Array.from(table.querySelectorAll('tr')).slice(1); // skip header
		if (rows.length <= limit) return null;
		const hidden = rows.slice(limit);
		hidden.forEach((tr) => {
			tr.style.display = 'none';
		});
		let expanded = false;
		if (storageKey && window.sessionStorage) {
			expanded = window.sessionStorage.getItem(storageKey) === 'true';
			if (expanded) hidden.forEach((tr) => { tr.style.display = ''; });
		}
		const toggle = document.createElement('button');
		const updateLabel = () => {
			toggle.textContent = expanded ? `Show first ${limit}` : `Show all (${rows.length})`;
		};
		toggle.addEventListener('click', () => {
			expanded = !expanded;
			hidden.forEach((tr) => {
				tr.style.display = expanded ? '' : 'none';
			});
			if (storageKey && window.sessionStorage) {
				window.sessionStorage.setItem(storageKey, String(expanded));
			}
			updateLabel();
		});
		updateLabel();
		return toggle;
	};

	const makeMoneyFormatter = (currencyCode) => {
		let formatter = null;
		try {
			if (currencyCode) {
				formatter = new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: currencyCode,
					minimumFractionDigits: 2,
				});
			}
		} catch (err) {
			formatter = null;
		}
		return (val) => {
			const num = Number.parseFloat(val);
			if (Number.isNaN(num)) return val ?? '';
			if (formatter) return formatter.format(num);
			return `$${num.toFixed(2)}`;
		};
	};

	const makeMoneyFormatterFromCents = (currencyCode) => {
		const base = makeMoneyFormatter(currencyCode);
		return (val) => {
			const num = Number.parseFloat(val);
			if (Number.isNaN(num)) return val ?? '';
			return base(num / 100);
		};
	};

	const statusToClass = (status) => {
		const normalized = String(status || '').toLowerCase();
		if (!normalized) return 'tm-oc-pill-neutral';
		if (['paid', 'completed', 'closed', 'success', 'applied'].some((s) => normalized.includes(s))) return 'tm-oc-pill-success';
		if (['open', 'pending', 'draft', 'in progress'].some((s) => normalized.includes(s))) return 'tm-oc-pill-info';
		if (['void', 'canceled', 'cancelled', 'failed'].some((s) => normalized.includes(s))) return 'tm-oc-pill-muted';
		if (['overdue', 'past due', 'delinquent'].some((s) => normalized.includes(s))) return 'tm-oc-pill-danger';
		return 'tm-oc-pill-neutral';
	};

	const renderStatusPill = (status, title) => {
		const pill = document.createElement('span');
		pill.className = `tm-oc-pill ${statusToClass(status)}`;
		pill.textContent = status ?? '';
		if (title) pill.title = title;
		return pill;
	};

	const createCopyButton = (url) => {
		if (!navigator?.clipboard || !url) return null;
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'tm-oc-icon-btn';
		btn.textContent = 'Copy';
		btn.title = 'Copy link';
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			navigator.clipboard.writeText(url).catch((err) => console.error('Copy failed', err));
		});
		return btn;
	};

	const setSectionStatus = (targetDiv, status, label) => {
		const badge = targetDiv?.__statusEl;
		if (!badge) return;
		if (!status) {
			badge.style.display = 'none';
			return;
		}
		badge.style.display = 'inline-block';
		badge.textContent = label || status;
		badge.className = `tm-oc-badge tm-oc-badge-${status}`;
	};

	const createControlButton = (text, onClick) => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'tm-oc-button';
		btn.textContent = text;
		btn.addEventListener('click', onClick);
		return btn;
	};

	const getCurrencyCode = () => window.tmOcCurrency || window.customerCreditInfo?.currency || 'USD';

	const handleModuleUnavailable = (targetDiv, label) => {
		targetDiv.textContent = `${label} unavailable for this account.`;
		setSectionStatus(targetDiv, 'idle', 'Not enabled');
	};

	const ensureStyles = () => {
		if (document.getElementById('tm-oldcredits-style')) return;
		const style = document.createElement('style');
		style.id = 'tm-oldcredits-style';
		style.textContent = `
			.tm-oc-wrap { display: flex; flex-direction: column; gap: 12px; }
			.tm-oc-section { padding: 12px; border: 1px solid #e3e6ec; border-radius: 8px; background: #f9fafc; }
			.tm-oc-section h3 { margin: 0; font-size: 16px; color: #1e2230; display: flex; align-items: center; flex: 1; }
			.tm-oc-table { width: 100%; border-collapse: collapse; }
			.tm-oc-table th, .tm-oc-table td { padding: 6px 8px; border: 1px solid #e5e7ee; text-align: left; }
			.tm-oc-table td { position: relative; padding-right: 46px; }
			.tm-oc-table th { background: #eef1f8; font-weight: 700; position: sticky; top: 0; z-index: 1; }
			.tm-oc-card-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 8px; }
			.tm-oc-card { border: 1px solid #e3e6ec; border-radius: 8px; padding: 10px 12px; background: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
			.tm-oc-card .tm-oc-label { font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase; color: #68707f; margin-bottom: 4px; display: block; }
			.tm-oc-card .tm-oc-value { font-size: 18px; font-weight: 700; color: #1e2230; }
			.tm-oc-card .tm-oc-value.tm-oc-danger { color: #c0392b; }
			.tm-oc-subtext { font-size: 12px; color: #4a4f62; margin-top: 4px; }
			.tm-oc-ul { padding-left: 18px; margin: 0; }
			.tm-oc-pill { display: inline-block; padding: 2px 6px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
			.tm-oc-pill-success { background: #e6f7f0; color: #117a42; }
			.tm-oc-pill-info { background: #e9f2ff; color: #1a5fb4; }
			.tm-oc-pill-muted { background: #f1f2f5; color: #6b7280; }
			.tm-oc-pill-danger { background: #fdecea; color: #c0392b; }
			.tm-oc-pill-neutral { background: #f6f7fb; color: #394150; }
			.tm-oc-badge { margin-left: 8px; padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 600; color: #1e2230; background: #eef1f8; }
			.tm-oc-badge-loading { color: #1a5fb4; background: #e8f0ff; }
			.tm-oc-badge-error { color: #c0392b; background: #fdecea; }
			.tm-oc-badge-success { color: #117a42; background: #e6f7f0; }
			.tm-oc-badge-idle { color: #68707f; background: #f1f2f5; }
			.tm-oc-controls { display: flex; gap: 8px; justify-content: flex-end; }
			.tm-oc-button, .tm-oc-icon-btn { border: 1px solid #d0d4dc; background: #ffffff; color: #1e2230; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-weight: 600; }
			.tm-oc-button:hover, .tm-oc-icon-btn:hover { border-color: #9aa3b5; background: #f6f8fb; }
			.tm-oc-icon-btn { padding: 4px 8px; line-height: 1; }
			.tm-oc-table td .tm-oc-icon-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); margin: 0; }
			.tm-oc-section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
			.tm-oc-badge { line-height: 1.4; }
		`;
		document.head.appendChild(style);
	};

	const buildCustomerUrl = () => {
		const customerId = getCustomerId();
		const accountId = getAccountId();
		if (!accountId) throw new Error('Missing account id');
		return `https://us.merchantos.com/API/Account/${accountId}/Customer/${customerId}.json?load_relations=all`;
	};

	const fetchCustomer = async () => {
		const url = buildCustomerUrl();
		try {
			const response = await fetch(url, { credentials: 'include' });
			if (!response.ok) throw new Error(`Request failed: ${response.status}`);
			const data = await response.json();
			window.latestCustomerData = data;
			const credit = data?.Customer?.CreditAccount || {};
			window.customerCreditInfo = {
				creditLimit: credit.creditLimit ?? null,
				creditAccoutnID: credit.creditAccoutnID ?? credit.creditAccountID ?? null,
				balance: credit.balance ?? null,
			};
			console.log('Fetched customer data:', data);
			console.log('Customer credit info:', window.customerCreditInfo);
			ensureCreditTab();
			showCreditTab();
		} catch (error) {
			console.error('Failed to fetch customer data', error);
		}
	};

	const clearAllTabDisplays = () => {
		document.querySelectorAll('.tabs article.tab').forEach((article) => {
			article.style.removeProperty('display');
		});
	};

	const employeeNameCache = new Map();
	const employeeFetches = new Map();

	const fetchEmployeeName = async (employeeId) => {
		const accountId = getAccountId();
		if (!accountId || !employeeId) throw new Error('Missing account or employee id');
		const url = `https://us.merchantos.com/API/V3/Account/${accountId}/Employee/${employeeId}.json`;
		const response = await fetch(url, {
			method: 'GET',
			credentials: 'include',
			headers: { Accept: 'application/json' },
		});
		if (!response.ok) throw new Error(`Emp fetch failed: ${response.status}`);
		const data = await response.json();
		const emp = data?.Employee;
		const name = [emp?.firstName, emp?.lastName].filter(Boolean).join(' ').trim();
		return name || String(employeeId);
	};

	const resolveEmployeeName = (employeeId, td) => {
		if (!employeeId) {
			td.textContent = '';
			return;
		}
		const accountId = getAccountId();
		const cacheKey = `${accountId || 'na'}:${employeeId}`;
		if (employeeNameCache.has(cacheKey)) {
			td.textContent = employeeNameCache.get(cacheKey);
			return;
		}
		td.textContent = 'Loading...';
		let promise = employeeFetches.get(cacheKey);
		if (!promise) {
			promise = fetchEmployeeName(employeeId)
				.then((name) => {
					employeeNameCache.set(cacheKey, name);
					return name;
				})
				.catch((err) => {
					console.error('Failed to fetch employee', employeeId, err);
					return String(employeeId);
				});
			employeeFetches.set(cacheKey, promise);
		}
		promise.then((name) => {
			td.textContent = name;
		});
	};

	let creditActivityLoading = false;
	let creditActivityFetchId = 0;

	const renderCreditActivity = (payments) => {
		ensureStyles();
		const container = document.getElementById('oldCreditsContent');
		if (!container) return;
		container.innerHTML = '';
		if (!payments || !payments.length) {
			container.textContent = 'No withdrawal payments found.';
			return;
		}

		if (payments[0]?.currency) {
			window.tmOcCurrency = payments[0].currency;
		}

		const currencyCode = getCurrencyCode();
		const formatMoney = makeMoneyFormatter(currencyCode);
		const formatMoneyCents = makeMoneyFormatterFromCents(currencyCode);

		const wrap = document.createElement('div');
		wrap.className = 'tm-oc-wrap';

		const controls = document.createElement('div');
		controls.className = 'tm-oc-controls';

		const refreshBtn = createControlButton('Refresh', () => {
			fetchCreditActivity();
		});

		let latestRows = [];

		const downloadCsv = () => {
			if (!latestRows.length) return;
			const headers = [
				'paymentRecord',
				'amount',
				'previous',
				'runningTotal',
				'spendSource',
				'depositPortion',
				'creditPortion',
				'tipAmount',
				'surchargeAmount',
				'createTime',
				'archived',
				'saleID',
				'paymentTypeID',
				'registerID',
				'employeeID',
			];
			const csvEscape = (val) => {
				if (val === null || val === undefined) return '';
				const str = String(val);
				if (str.includes('"') || str.includes(',') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
				return str;
			};
			const lines = [headers.join(',')];
			latestRows.forEach((row) => {
				const values = [
					row.salePaymentID ?? '',
					row.amount ?? '',
					row._previous ?? '',
					row._runningTotal ?? '',
					row._spendSource ?? '',
					row._depositPortion ?? '',
					row._creditPortion ?? '',
					row.tipAmount ?? '',
					row.surchargeAmount ?? '',
					row.createTime ?? '',
					row.archived ?? '',
					row.saleID ?? '',
					row.paymentTypeID ?? '',
					row.registerID ?? '',
					row.employeeID ?? '',
				];
				lines.push(values.map(csvEscape).join(','));
			});
			const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `credit-activity-${new Date().toISOString()}.csv`;
			a.click();
			URL.revokeObjectURL(url);
		};

		const exportBtn = createControlButton('Export CSV', downloadCsv);

		controls.appendChild(refreshBtn);
		controls.appendChild(exportBtn);
		wrap.appendChild(controls);

		const computeRunningTotals = (rows) => {
			const isArchived = (row) => String(row?.archived).toLowerCase() === 'true';
			let runningTotal = 0;
			return rows.map((row) => {
				const archived = isArchived(row);
				const amountNum = Number.parseFloat(row?.amount) || 0;
				const previous = runningTotal;
				let depositPortion = 0;
				let creditPortion = 0;
				let spendSource = '';

				if (!archived && amountNum > 0) {
					const availableDeposit = Math.max(0, -previous);
					depositPortion = Math.min(amountNum, availableDeposit);
					creditPortion = amountNum - depositPortion;

					if (depositPortion > 0 && creditPortion > 0) {
						spendSource = 'mixed';
					} else if (creditPortion > 0) {
						spendSource = 'credit-limit';
					} else if (depositPortion > 0) {
						spendSource = 'account-deposit';
					}
				}

				if (!archived) {
					runningTotal = previous + amountNum;
				}

				return {
					...row,
					_previous: previous,
					_runningTotal: runningTotal,
					_depositPortion: !archived && amountNum > 0 ? depositPortion : '',
					_creditPortion: !archived && amountNum > 0 ? creditPortion : '',
					_spendSource: !archived && amountNum > 0 ? spendSource : '',
				};
			});
		};

		const paymentsWithTotals = computeRunningTotals(payments);
		latestRows = paymentsWithTotals;

		const formatDateTime = (val) => {
			if (!val) return '';
			const d = new Date(val);
			if (Number.isNaN(d.getTime())) return val;
			const mm = String(d.getMonth() + 1).padStart(2, '0');
			const dd = String(d.getDate()).padStart(2, '0');
			const yyyy = d.getFullYear();
			const hh = String(d.getHours()).padStart(2, '0');
			const min = String(d.getMinutes()).padStart(2, '0');
			return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
		};

		const tableSection = document.createElement('div');
		tableSection.className = 'tm-oc-section';
		const tableHeading = document.createElement('h3');
		tableHeading.textContent = 'Credit Activity';
		tableSection.appendChild(tableHeading);

		const table = document.createElement('table');
		table.className = 'tm-oc-table';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'salePaymentID', label: 'Payment Record', render: (val, row, td) => {
				const displayId = val ?? '';
				if (!displayId) return;
				const paymentId = row?.paymentID || displayId;
				const url = `https://us.merchantos.com/?name=reports.register.views.payment&form_name=view&id=${paymentId}&tab=details`;
				const link = document.createElement('a');
				link.href = url;
				link.textContent = String(displayId);
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
				const copyBtn = createCopyButton(url);
				if (copyBtn) td.appendChild(copyBtn);
			}},
			{ key: 'amount', label: 'amount', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: '_previous', label: 'previous', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: '_runningTotal', label: 'runningTotal', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: '_spendSource', label: 'spendSource' },
			{ key: '_depositPortion', label: 'depositPortion', render: (val, _row, td) => { td.textContent = val === '' ? '' : formatMoney(val); } },
			{ key: '_creditPortion', label: 'creditPortion', render: (val, _row, td) => { td.textContent = val === '' ? '' : formatMoney(val); } },
			{ key: 'tipAmount', label: 'tipAmount', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: 'surchargeAmount', label: 'surchargeAmount', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: 'createTime', label: 'createTime', render: (val, _row, td) => { td.textContent = formatDateTime(val); } },
			{ key: 'archived', label: 'archived' },
			{ key: 'saleID', label: 'saleID', render: (val, _row, td) => {
				const saleId = val ?? '';
				if (!saleId) return;
				const url = `https://us.merchantos.com/?name=transaction.views.transaction&form_name=view&id=${saleId}&tab=details`;
				const link = document.createElement('a');
				link.href = url;
				link.textContent = String(saleId);
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
				const copyBtn = createCopyButton(url);
				if (copyBtn) td.appendChild(copyBtn);
			}},
			{ key: 'paymentTypeID', label: 'paymentTypeID' },
			{ key: 'registerID', label: 'registerID' },
			{ key: 'employeeID', label: 'employee', render: (val, _row, td) => { resolveEmployeeName(val, td); } },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		paymentsWithTotals.forEach((p) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = p?.[key];
				if (render) {
					render(raw, p, td);
				} else {
					td.textContent = raw ?? '';
				}
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		tableSection.appendChild(table);
		wrap.appendChild(tableSection);

		const toggle = addTableToggle(table, 15, 'tm-oc-toggle-credit-activity');
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			tableSection.appendChild(toggleWrap);
		}

		const toNumber = (val) => {
			const num = Number.parseFloat(val);
			return Number.isNaN(num) ? 0 : num;
		};
		const totals = payments.reduce(
			(acc, p) => {
				const archived = String(p?.archived).toLowerCase() === 'true';
				if (archived) return acc;
				acc.amount += toNumber(p?.amount);
				acc.tipAmount += toNumber(p?.tipAmount);
				acc.surchargeAmount += toNumber(p?.surchargeAmount);
				return acc;
			},
			{ amount: 0, tipAmount: 0, surchargeAmount: 0 }
		);

		const creditInfo = window.customerCreditInfo || {};
		const creditLimitNum = toNumber(creditInfo.creditLimit);
		const onDepositNum = toNumber(creditInfo.balance);
		const availableNum = creditLimitNum - onDepositNum;

		const cardsSection = document.createElement('div');
		cardsSection.className = 'tm-oc-section';
		const cardsHeading = document.createElement('h3');
		cardsHeading.textContent = 'Summary';
		cardsSection.appendChild(cardsHeading);

		const cardGrid = document.createElement('div');
		cardGrid.className = 'tm-oc-card-grid';

		const addCard = (label, value, subtext = '', options = {}) => {
			const card = document.createElement('div');
			card.className = 'tm-oc-card';
			const lbl = document.createElement('span');
			lbl.className = 'tm-oc-label';
			lbl.textContent = label;
			const val = document.createElement('div');
			val.className = `tm-oc-value${options.danger ? ' tm-oc-danger' : ''}`;
			val.textContent = value;
			card.appendChild(lbl);
			card.appendChild(val);
			if (subtext) {
				const sub = document.createElement('div');
				sub.className = 'tm-oc-subtext';
				sub.textContent = subtext;
				card.appendChild(sub);
			}
			cardGrid.appendChild(card);
		};

		addCard('Total Amount', formatMoney(totals.amount), 'Sum of non-archived payments');
		addCard('Tips', formatMoney(totals.tipAmount));
		addCard('Surcharges', formatMoney(totals.surchargeAmount));
		addCard('Credit Limit', formatMoney(creditLimitNum));
		addCard('Account Balance', formatMoney(onDepositNum), 'Positive deposits are customers owing');
		addCard('Available', Number.isNaN(availableNum) ? '' : formatMoney(availableNum));

		cardsSection.appendChild(cardGrid);
		wrap.appendChild(cardsSection);


		const makeSectionDiv = (id, label) => {
			const section = document.createElement('div');
			section.className = 'tm-oc-section';
			const header = document.createElement('div');
			header.className = 'tm-oc-section-header';
			const h = document.createElement('h3');
			h.textContent = label;
			const badge = document.createElement('span');
			badge.className = 'tm-oc-badge tm-oc-badge-loading';
			badge.textContent = 'Loading';
			header.appendChild(h);
			header.appendChild(badge);
			const body = document.createElement('div');
			body.id = id;
			body.textContent = `Loading ${label.toLowerCase()}...`;
			body.__statusEl = badge;
			section.appendChild(header);
			section.appendChild(body);
			wrap.appendChild(section);
			return body;
		};

		const invoicesDiv = makeSectionDiv('oldCreditsInvoices', 'Invoices');
		fetchInvoices(invoicesDiv, formatMoneyCents, formatDateTime);

		const memosDiv = makeSectionDiv('oldCreditsCreditMemos', 'Credit Memos');
		fetchCreditMemos(memosDiv, formatMoneyCents, formatDateTime);

		const accountSummaryDiv = makeSectionDiv('oldCreditsCustomerAccount', 'Customer Account Summary');
		fetchCustomerAccountSummary(accountSummaryDiv, formatMoney);

		const paymentRequestsDiv = makeSectionDiv('oldCreditsPaymentRequests', 'Payment Requests');
		fetchPaymentRequests(paymentRequestsDiv, formatMoneyCents, formatDateTime);

		container.appendChild(wrap);
	};

	const fetchInvoices = async (targetDiv, moneyFormatter, dateFormatter) => {
		const creditAccountRef = getCreditAccountRef();
		if (!creditAccountRef) {
			targetDiv.textContent = 'Invoices unavailable (missing credit account id).';
			setSectionStatus(targetDiv, 'error', 'Missing account');
			return;
		}

		targetDiv.textContent = 'Loading invoices...';
		setSectionStatus(targetDiv, 'loading', 'Loading');
		const url = `https://us.merchantos.com/admin/invoicing/v1/credit-accounts/${encodeURIComponent(creditAccountRef)}/invoices?page=1&limit=20&sort=createdAt:desc`;

		try {
			const response = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
			if (response.status === 401) {
				handleModuleUnavailable(targetDiv, 'Invoices');
				return;
			}
			if (!response.ok) throw new Error(`Invoices request failed: ${response.status}`);
			const data = await response.json();
			const invoices = Array.isArray(data?.data) ? data.data : [];
			renderInvoices(targetDiv, invoices, moneyFormatter, dateFormatter);
			setSectionStatus(targetDiv, 'success', 'Loaded');
		} catch (err) {
			console.error('Failed to fetch invoices', err);
			targetDiv.textContent = `Failed to load invoices: ${err.message}`;
			setSectionStatus(targetDiv, 'error', 'Failed');
		}
	};

	const fetchCreditMemos = async (targetDiv, moneyFormatter, dateFormatter) => {
		const creditAccountRef = getCreditAccountRef();
		if (!creditAccountRef) {
			targetDiv.textContent = 'Credit memos unavailable (missing credit account id).';
			setSectionStatus(targetDiv, 'error', 'Missing account');
			return;
		}

		targetDiv.textContent = 'Loading credit memos...';
		setSectionStatus(targetDiv, 'loading', 'Loading');
		const url = `https://us.merchantos.com/admin/invoicing/v1/credit-accounts/${encodeURIComponent(creditAccountRef)}/credit-memos?page=1&limit=20`;

		try {
			const response = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
			if (response.status === 401) {
				handleModuleUnavailable(targetDiv, 'Credit memos');
				return;
			}
			if (!response.ok) throw new Error(`Credit memos request failed: ${response.status}`);
			const data = await response.json();
			const memos = Array.isArray(data?.data) ? data.data : [];
			renderCreditMemos(targetDiv, memos, moneyFormatter, dateFormatter);
			setSectionStatus(targetDiv, 'success', 'Loaded');
		} catch (err) {
			console.error('Failed to fetch credit memos', err);
			targetDiv.textContent = `Failed to load credit memos: ${err.message}`;
			setSectionStatus(targetDiv, 'error', 'Failed');
		}
	};

	const fetchPaymentRequests = async (targetDiv, moneyFormatter, dateFormatter) => {
		const customerRef = getCustomerId();
		if (!customerRef) {
			targetDiv.textContent = 'Payment requests unavailable (missing customer id).';
			setSectionStatus(targetDiv, 'error', 'Missing customer');
			return;
		}

		targetDiv.textContent = 'Loading payment requests...';
		setSectionStatus(targetDiv, 'loading', 'Loading');
		const url = `https://us.merchantos.com/admin/invoicing/payment-requests?customerRef=${encodeURIComponent(customerRef)}`;

		try {
			const response = await fetch(url, {
				method: 'GET',
				credentials: 'include',
				headers: { Accept: 'application/json' },
			});
			if (response.status === 401) {
				handleModuleUnavailable(targetDiv, 'Payment requests');
				return;
			}
			if (!response.ok) throw new Error(`Payment requests failed: ${response.status}`);
			const data = await response.json();
			const requests = Array.isArray(data?.data) ? data.data : [];
			if (requests[0]?.currency) window.tmOcCurrency = requests[0].currency;
			const refreshedMoneyFormatter = makeMoneyFormatterFromCents(getCurrencyCode());
			renderPaymentRequests(targetDiv, requests, refreshedMoneyFormatter, dateFormatter);
			setSectionStatus(targetDiv, 'success', 'Loaded');
		} catch (err) {
			console.error('Failed to fetch payment requests', err);
			targetDiv.textContent = `Failed to load payment requests: ${err.message}`;
			setSectionStatus(targetDiv, 'error', 'Failed');
		}
	};

	const fetchCustomerAccountSummary = async (targetDiv, moneyFormatter) => {
		const creditAccountId = getCreditAccountId();
		if (!creditAccountId) {
			targetDiv.textContent = 'Customer account summary unavailable (missing credit account id).';
			setSectionStatus(targetDiv, 'error', 'Missing account');
			return;
		}

		const creditLimitParam = window.customerCreditInfo?.creditLimit ?? '';
		targetDiv.textContent = 'Loading customer account summary...';
		setSectionStatus(targetDiv, 'loading', 'Loading');
		const url = `https://us.merchantos.com/admin/invoicing/ls-customer-accounts/${encodeURIComponent(creditAccountId)}?credit_limit=${encodeURIComponent(creditLimitParam)}`;

		try {
			const response = await fetch(url, {
				method: 'GET',
				credentials: 'include',
				headers: { Accept: 'application/json' },
			});
			if (response.status === 401) {
				handleModuleUnavailable(targetDiv, 'Customer account summary');
				return;
			}
			if (!response.ok) throw new Error(`Customer account request failed: ${response.status}`);
			const data = await response.json();
			const attr = data?.attributes || {};
			if (attr.currency) window.tmOcCurrency = attr.currency;
			const money = makeMoneyFormatter(getCurrencyCode());
			targetDiv.innerHTML = '';
			ensureStyles();

			const grid = document.createElement('div');
			grid.className = 'tm-oc-card-grid';

			const addCard = (label, value, _sub = '', options = {}) => {
				if (value === undefined || value === null || value === '') return;
				const card = document.createElement('div');
				card.className = 'tm-oc-card';
				const lbl = document.createElement('span');
				lbl.className = 'tm-oc-label';
				lbl.textContent = label;
				const val = document.createElement('div');
				val.className = `tm-oc-value${options.danger ? ' tm-oc-danger' : ''}`;
				val.textContent = value;
				card.appendChild(lbl);
				card.appendChild(val);
				grid.appendChild(card);
			};

			addCard('Credit Limit', money(attr.creditLimit));
			addCard('Available From Limit', money(attr.availableAmountFromCreditLimit));
			addCard('Deposit Balance', money(attr.depositBalance));
			addCard('Owing Balance', money(attr.owingBalance));
			addCard('Overdue Balance', money(attr.overdueBalance), '', { danger: Number.parseFloat(attr.overdueBalance) > 0 });
			if (attr.currency) addCard('Currency', attr.currency);
			setSectionStatus(targetDiv, 'success', 'Loaded');
			targetDiv.appendChild(grid);
		} catch (err) {
			console.error('Failed to fetch customer account summary', err);
			targetDiv.textContent = `Failed to load customer account summary: ${err.message}`;
			setSectionStatus(targetDiv, 'error', 'Failed');
		}
	};

	const renderInvoices = (targetDiv, invoices, moneyFormatter, dateFormatter) => {
		ensureStyles();
		targetDiv.innerHTML = '<strong>Invoices</strong>';
		if (!invoices.length) {
			targetDiv.innerHTML += '<div>No invoices found.</div>';
			return;
		}

		const totals = invoices.reduce((acc, inv) => {
			const num = Number.parseFloat(inv?.total);
			if (!Number.isNaN(num)) acc.total += num;
			return acc;
		}, { total: 0 });

		const table = document.createElement('table');
		table.className = 'tm-oc-table';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'invoiceNumber', label: 'Invoice #' },
			{ key: 'transactionRef', label: 'Transaction Ref', render: (val, _row, td) => {
				const saleId = extractSaleId(val);
				if (!saleId) {
					td.textContent = val ?? '';
					return;
				}
				const url = `https://us.merchantos.com/?name=transaction.views.transaction&form_name=view&id=${saleId}&tab=details`;
				const link = document.createElement('a');
				link.href = url;
				link.textContent = val;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
				const copyBtn = createCopyButton(url);
				if (copyBtn) td.appendChild(copyBtn);
			} },
			{ key: 'total', label: 'Total', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'status', label: 'Status', render: (val, _row, td) => { td.appendChild(renderStatusPill(val)); } },
			{ key: 'issueDate', label: 'Issue Date', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
			{ key: 'createdAt', label: 'Created At', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
			{ key: 'terms', label: 'Terms', render: (val, row, td) => {
				const terms = val || row?.terms;
				if (!terms) return;
				const parts = [];
				if (terms.dueDate) parts.push(`Due: ${dateFormatter(terms.dueDate)}`);
				if (terms.customerEmail) parts.push(`Email: ${terms.customerEmail}`);
				if (typeof terms.sendByEmail === 'boolean') parts.push(`Send by email: ${terms.sendByEmail}`);
				td.textContent = parts.join(' | ');
			} },
			{ key: 'proposalURL', label: 'Proposal', render: (val, _row, td) => {
				if (!val) return;
				const link = document.createElement('a');
				link.href = val;
				link.textContent = 'Open';
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
				const copyBtn = createCopyButton(val);
				if (copyBtn) td.appendChild(copyBtn);
			} },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		invoices.forEach((inv) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = inv?.[key];
				if (render) {
					render(raw, inv, td);
				} else {
					td.textContent = raw ?? '';
				}
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		const tfoot = document.createElement('tfoot');
		const totalRow = document.createElement('tr');
		columns.forEach((col, idx) => {
			const td = document.createElement('td');
			if (idx === 0) td.textContent = 'Totals';
			if (col.key === 'total') td.textContent = moneyFormatter(totals.total);
			totalRow.appendChild(td);
		});
		tfoot.appendChild(totalRow);
		table.appendChild(tfoot);

		targetDiv.appendChild(table);
		const toggle = addTableToggle(table, 15, 'tm-oc-toggle-invoices');
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			targetDiv.appendChild(toggleWrap);
		}
	};

	const renderCreditMemos = (targetDiv, memos, moneyFormatter, dateFormatter) => {
		ensureStyles();
		targetDiv.innerHTML = '<strong>Credit Memos</strong>';
		if (!memos.length) {
			targetDiv.innerHTML += '<div>No credit memos found.</div>';
			return;
		}

		const totals = memos.reduce((acc, memo) => {
			const amt = Number.parseFloat(memo?.amount);
			const rem = Number.parseFloat(memo?.remainingAmount);
			if (!Number.isNaN(amt)) acc.amount += amt;
			if (!Number.isNaN(rem)) acc.remainingAmount += rem;
			return acc;
		}, { amount: 0, remainingAmount: 0 });

		const table = document.createElement('table');
		table.className = 'tm-oc-table';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'creditMemoNumber', label: 'Credit Memo #' },
			{ key: 'type', label: 'Type' },
			{ key: 'amount', label: 'Amount', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'remainingAmount', label: 'Remaining', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'status', label: 'Status', render: (val, _row, td) => { td.appendChild(renderStatusPill(val)); } },
			{ key: 'transactionRef', label: 'Transaction Ref', render: (val, _row, td) => {
				const saleId = extractSaleId(val);
				if (!saleId) {
					td.textContent = val ?? '';
					return;
				}
				const url = `https://us.merchantos.com/?name=transaction.views.transaction&form_name=view&id=${saleId}&tab=details`;
				const link = document.createElement('a');
				link.href = url;
				link.textContent = val;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
				const copyBtn = createCopyButton(url);
				if (copyBtn) td.appendChild(copyBtn);
			} },
			{ key: 'createdAt', label: 'Created At', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		memos.forEach((memo) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = memo?.[key];
				if (render) {
					render(raw, memo, td);
				} else {
					td.textContent = raw ?? '';
				}
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		const tfoot = document.createElement('tfoot');
		const totalRow = document.createElement('tr');
		columns.forEach((col, idx) => {
			const td = document.createElement('td');
			if (idx === 0) td.textContent = 'Totals';
			if (col.key === 'amount') td.textContent = moneyFormatter(totals.amount);
			if (col.key === 'remainingAmount') td.textContent = moneyFormatter(totals.remainingAmount);
			totalRow.appendChild(td);
		});
		tfoot.appendChild(totalRow);
		table.appendChild(tfoot);

		targetDiv.appendChild(table);
		const toggle = addTableToggle(table, 15, 'tm-oc-toggle-credit-memos');
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			targetDiv.appendChild(toggleWrap);
		}
	};

	const renderPaymentRequests = (targetDiv, requests, moneyFormatter, dateFormatter) => {
		ensureStyles();
		targetDiv.innerHTML = '<strong>Payment Requests</strong>';
		if (!requests.length) {
			targetDiv.innerHTML += '<div>No payment requests found.</div>';
			return;
		}

		const totals = requests.reduce((acc, req) => {
			const requested = Number.parseFloat(req?.requestedAmount);
			if (!Number.isNaN(requested)) acc.requested += requested;
			const paid = Array.isArray(req?.payments) ? req.payments.reduce((pAcc, p) => {
				const amt = Number.parseFloat(p?.amount);
				return Number.isNaN(amt) ? pAcc : pAcc + amt;
			}, 0) : 0;
			acc.paid += paid;
			return acc;
		}, { requested: 0, paid: 0 });

		const formatDiscounts = (discounts) => {
			if (!Array.isArray(discounts) || !discounts.length) return '';
			return discounts
				.map((d) => {
					const percent = typeof d?.percent === 'number' ? `${(d.percent * 100).toFixed(0)}%` : '';
					const amount = typeof d?.totalAmount === 'number' ? moneyFormatter(d.totalAmount) : '';
					const label = d?.name || d?.type || 'Discount';
					return [label, percent, amount && `(${amount})`].filter(Boolean).join(' ');
				})
				.join('; ');
		};

		const formatFees = (fees) => {
			if (!Array.isArray(fees) || !fees.length) return '';
			return fees
				.map((f) => {
					const amount = typeof f?.totalAmount === 'number' ? moneyFormatter(f.totalAmount) : '';
					const label = f?.name || f?.type || 'Fee';
					return [label, amount].filter(Boolean).join(' ');
				})
				.join('; ');
		};

		const table = document.createElement('table');
		table.className = 'tm-oc-table';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'status', label: 'Status', render: (val, _row, td) => { td.appendChild(renderStatusPill(val)); } },
			{ key: 'requestedAmount', label: 'Requested', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'currency', label: 'Currency' },
			{ key: 'location', label: 'Location', render: (_val, row, td) => {
				const loc = row?.location || {};
				const parts = [loc.name, loc.email].filter(Boolean).join(' | ');
				td.textContent = parts;
			} },
			{ key: 'customer', label: 'Customer', render: (_val, row, td) => {
				const cust = row?.customer || {};
				const name = [cust.firstName, cust.lastName].filter(Boolean).join(' ').trim();
				const extras = [cust.email, cust.customerRef ? `Ref ${cust.customerRef}` : '', cust.creditAccountRef ? `Credit ${cust.creditAccountRef}` : '']
					.filter(Boolean)
					.join(' | ');
				td.textContent = [name, extras].filter(Boolean).join(' — ');
			} },
			{ key: 'pricingTables', label: 'Items / Discounts / Fees', render: (_val, row, td) => {
				const pts = Array.isArray(row?.pricingTables) ? row.pricingTables : [];
				if (!pts.length) return;
				const list = document.createElement('ul');
				list.style.paddingLeft = '18px';
				list.style.margin = '0';
				pts.forEach((pt) => {
					const li = document.createElement('li');
					const summary = `${pt?.title || 'Pricing'}: Total ${moneyFormatter(pt?.totalAmount)} (Subtotal ${moneyFormatter(pt?.subtotal)}, Discounts ${moneyFormatter(pt?.discountTotal)}, Fees ${moneyFormatter(pt?.feeTotal)}, Tax ${moneyFormatter(pt?.taxTotal)})`;
					li.textContent = summary;
					const itemsList = document.createElement('ul');
					itemsList.style.paddingLeft = '16px';
					itemsList.style.margin = '4px 0 0 0';
					const lineItems = Array.isArray(pt?.lineItems) ? pt.lineItems : [];
					lineItems.forEach((item) => {
						const innerLi = document.createElement('li');
						const pieces = [];
						pieces.push(`${item?.quantity ?? 0} x ${item?.name || 'Item'}`);
						pieces.push(`@ ${moneyFormatter(item?.unitAmount)}`);
						pieces.push(`= ${moneyFormatter(item?.totalAmount)}`);
						const extras = [];
						const discounts = formatDiscounts(item?.discounts);
						if (discounts) extras.push(`Discounts: ${discounts}`);
						const fees = formatFees(item?.fees);
						if (fees) extras.push(`Fees: ${fees}`);
						if (extras.length) pieces.push(`(${extras.join(' | ')})`);
						innerLi.textContent = pieces.filter(Boolean).join(' ');
						itemsList.appendChild(innerLi);
					});
					const tableDiscounts = formatDiscounts(pt?.discounts);
					if (tableDiscounts) {
						const dLi = document.createElement('li');
						dLi.textContent = `Table Discounts: ${tableDiscounts}`;
						itemsList.appendChild(dLi);
					}
					const tableFees = formatFees(pt?.fees);
					if (tableFees) {
						const fLi = document.createElement('li');
						fLi.textContent = `Table Fees: ${tableFees}`;
						itemsList.appendChild(fLi);
					}
					if (itemsList.childElementCount) li.appendChild(itemsList);
					list.appendChild(li);
				});
				td.appendChild(list);
			} },
			{ key: 'payments', label: 'Payments', render: (_val, row, td) => {
				const payments = Array.isArray(row?.payments) ? row.payments : [];
				if (!payments.length) return;
				const list = document.createElement('ul');
				list.style.paddingLeft = '18px';
				list.style.margin = '0';
				payments.forEach((p) => {
					const li = document.createElement('li');
					const statusPill = p?.status ? renderStatusPill(p.status) : null;
					if (statusPill) li.appendChild(statusPill);
					const details = [moneyFormatter(p?.amount), p?.cardBrand ? `Card ${p.cardBrand}` : '', p?.last4 ? `xxxx${p.last4}` : '', p?.dateTaken ? dateFormatter(p.dateTaken) : '']
						.filter(Boolean)
						.join(' | ');
					if (details) {
						const span = document.createElement('span');
						if (statusPill) span.style.marginLeft = '6px';
						span.textContent = details;
						li.appendChild(span);
					}
					list.appendChild(li);
				});
				td.appendChild(list);
			} },
			{ key: 'documentRefs', label: 'Docs', render: (val, row, td) => {
				const docs = Array.isArray(val) ? val : [];
				const proposal = row?.proposalHash;
				const parts = [];
				if (docs.length) parts.push(`Refs: ${docs.join(', ')}`);
				if (proposal) parts.push(`Proposal: ${proposal}`);
				td.textContent = parts.join(' | ');
			} },
			{ key: 'createdAt', label: 'Created At', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		requests.forEach((req) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = req?.[key];
				if (render) {
					render(raw, req, td);
				} else {
					td.textContent = raw ?? '';
				}
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		const tfoot = document.createElement('tfoot');
		const totalRow = document.createElement('tr');
		columns.forEach((col, idx) => {
			const td = document.createElement('td');
			if (idx === 0) td.textContent = 'Totals';
			if (col.key === 'requestedAmount') td.textContent = moneyFormatter(totals.requested);
			if (col.key === 'payments' && totals.paid) td.textContent = `Paid: ${moneyFormatter(totals.paid)}`;
			totalRow.appendChild(td);
		});
		tfoot.appendChild(totalRow);
		table.appendChild(tfoot);

		targetDiv.appendChild(table);
		const toggle = addTableToggle(table, 10, 'tm-oc-toggle-payment-requests');
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			targetDiv.appendChild(toggleWrap);
		}
	};

	const fetchCreditActivity = async () => {
		const creditAccountId = window.customerCreditInfo?.creditAccoutnID ?? window.customerCreditInfo?.creditAccountID;
		const accountId = getAccountId();
		if (!creditAccountId || !accountId) {
			console.warn('Missing credit account or account id for activity fetch');
			return;
		}

		if (creditActivityLoading) return;
		creditActivityLoading = true;
		const fetchId = ++creditActivityFetchId;

		const targetUrl = `https://us.merchantos.com/API/Account/${accountId}/CreditAccount/${creditAccountId}.json?load_relations=all`;
		const container = document.getElementById('oldCreditsContent');
		if (container) container.textContent = 'Loading credit activity...';

		try {
			const response = await fetch(targetUrl, {
				method: 'GET',
				credentials: 'include',
				headers: {
					Accept: 'application/json',
				},
			});

			if (response.status === 401) {
				const container = document.getElementById('oldCreditsContent');
				if (container) container.textContent = 'Credit activity unavailable for this account.';
				return;
			}

			if (!response.ok) throw new Error(`Activity request failed: ${response.status}`);
			const data = await response.json();
			const paymentsRaw = data?.CreditAccount?.WithdrawalPayments?.SalePayment;
			const payments = Array.isArray(paymentsRaw) ? paymentsRaw : paymentsRaw ? [paymentsRaw] : [];

			if (fetchId !== creditActivityFetchId) return;
			window.latestCreditActivity = { raw: data, payments };
			renderCreditActivity(payments);
		} catch (error) {
			console.error('Failed to fetch credit activity', error);
			if (container) container.textContent = `Failed to load credit activity: ${error.message}`;
		} finally {
			creditActivityLoading = false;
		}
	};

	const showCreditTab = () => {
		const tabsMenu = document.getElementById('tabsMenu');
		const tabsContainer = document.querySelector('.tabs');
		const creditArticle = document.getElementById('tab-oldcredits-article');
		if (!tabsMenu || !tabsContainer || !creditArticle) return;

		tabsMenu.querySelectorAll('li').forEach((li) => li.classList.remove('current'));
		const creditTabLi = document.getElementById('menuOldCredits')?.parentElement;
		if (creditTabLi) creditTabLi.classList.add('current');

		tabsContainer.querySelectorAll('article.tab').forEach((article) => {
			article.classList.add('inactive');
			article.style.removeProperty('display');
		});

		const creditContent = document.getElementById('oldCreditsContent');
		if (creditContent) {
			creditContent.textContent = 'Loading credit activity...';
		}

		creditArticle.classList.remove('inactive');
		creditArticle.style.removeProperty('display');
		fetchCreditActivity();
	};

	const ensureCreditTab = () => {
		const tabsMenu = document.getElementById('tabsMenu');
		const tabsContainer = document.querySelector('.tabs');
		if (!tabsMenu || !tabsContainer) return;

		if (!tabsMenu.dataset.tmCleanupAttached) {
			tabsMenu.addEventListener('click', (e) => {
				const anchor = e.target.closest('a');
				if (!anchor || anchor.id === 'menuOldCredits') return;
				clearAllTabDisplays();
			});
			tabsMenu.dataset.tmCleanupAttached = 'true';
		}

		if (!document.getElementById('menuOldCredits')) {
			const li = document.createElement('li');
			li.className = 'oldcredits';
			const anchor = document.createElement('a');
			anchor.id = 'menuOldCredits';
			anchor.href = '#oldcredits';
			anchor.textContent = 'Old Credits';
			anchor.addEventListener('click', (e) => {
				e.preventDefault();
				showCreditTab();
			});
			li.appendChild(anchor);
			tabsMenu.appendChild(li);
		}

		if (!document.getElementById('tab-oldcredits-article')) {
			const article = document.createElement('article');
			article.className = 'view_tab_oldcredits tab loaded inactive';
			article.id = 'tab-oldcredits-article';
			const content = document.createElement('div');
			content.className = 'content';
			content.id = 'tab_oldcredits';
			const div = document.createElement('div');
			div.id = 'oldCreditsContent';
			div.textContent = 'Loading credit activity...';
			content.appendChild(div);
			article.appendChild(content);
			tabsContainer.appendChild(article);
		}
	};

	const injectButton = () => {
		if (document.getElementById('tm-fetch-customer')) return;
		const button = document.createElement('button');
		button.id = 'tm-fetch-customer';
		button.textContent = 'Fetch Customer';
		Object.assign(button.style, {
			position: 'absolute',
			top: '12px',
			right: '12px',
			padding: '8px 12px',
			zIndex: '9999',
			cursor: 'pointer',
		});
		button.addEventListener('click', fetchCustomer);
		document.body.appendChild(button);
	};

	const init = () => {
		injectButton();
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
