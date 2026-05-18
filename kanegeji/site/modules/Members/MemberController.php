<?php

namespace App\Modules\Members;

use App\Core\{Audit, Auth, Controller, Database, Request, Session};

class MemberController extends Controller
{
    private MemberModel $model;

    public function __construct()
    {
        $this->model = new MemberModel();
    }

    public function index(): void
    {
        $this->requirePermission('members.view');

        $q         = Request::sanitize('q');
        $page      = max(1, Request::int('page', 1));
        $filters   = Request::only(['status', 'community_id', 'gender']);
        $paginator = $this->model->search($q, $page, 20, $filters);

        $communities = Database::select(
            "SELECT id, name FROM communities WHERE parish_id = ? AND active = 1 ORDER BY name",
            [Auth::parishId()]
        );

        $this->view('Members/views/index', [
            'pageTitle'   => __('members.title', 'Wanachama'),
            'paginator'   => $paginator,
            'q'           => $q,
            'filters'     => $filters,
            'communities' => $communities,
        ]);
    }

    public function create(): void
    {
        $this->requirePermission('members.create');

        $communities = Database::select(
            "SELECT id, name FROM communities WHERE parish_id = ? AND active = 1 ORDER BY name",
            [Auth::parishId()]
        );
        $families = Database::select(
            "SELECT id, family_name FROM families WHERE parish_id = ? ORDER BY family_name",
            [Auth::parishId()]
        );

        $this->view('Members/views/create', [
            'pageTitle'   => __('members.add_member', 'Ongeza Mwanachama'),
            'communities' => $communities,
            'families'    => $families,
            'member'      => [],
        ]);
    }

    public function store(): void
    {
        $this->requirePermission('members.create');
        $this->verifyCsrf();

        $data = Request::only([
            'first_name', 'middle_name', 'last_name', 'gender', 'date_of_birth',
            'phone', 'email', 'community_id', 'family_id', 'occupation',
            'address', 'marriage_status', 'baptised', 'confirmed',
        ]);

        $errors = $this->validate($data, [
            'first_name' => 'required|max:80',
            'last_name'  => 'required|max:80',
            'gender'     => 'required',
        ]);

        if ($errors) {
            Session::flash('error', 'Tafadhali sahihisha makosa yaliyoonyeshwa.');
            $this->view('Members/views/create', [
                'pageTitle' => __('members.add_member', 'Ongeza Mwanachama'),
                'errors'    => $errors,
                'member'    => $data,
            ]);
            return;
        }

        $data['member_number'] = $this->model->generateMemberNumber();
        $data['qr_code']       = generateCode('MBR', 12);
        $data['registered_by'] = Auth::id();
        $data['baptised']      = isset($data['baptised']) ? 1 : 0;
        $data['confirmed']     = isset($data['confirmed']) ? 1 : 0;
        $data['community_id']  = $data['community_id'] ?: null;
        $data['family_id']     = $data['family_id'] ?: null;
        $data['date_of_birth'] = $data['date_of_birth'] ?: null;

        // Remove empty strings for nullable fields
        foreach (['email', 'phone', 'occupation', 'address', 'middle_name'] as $f) {
            $data[$f] = $data[$f] ?: null;
        }

        $id = $this->model->create($data);
        Audit::log('member.create', 'Members', 'member', (int) $id, [], $data);

        Session::flash('success', __('members.member_saved', 'Mwanachama amehifadhiwa.'));
        $this->redirect("/members/{$id}");
    }

    public function show(string $id): void
    {
        $this->requirePermission('members.view');

        $member     = $this->model->getWithDetails((int) $id);
        if (!$member) { $this->redirect('/members'); }

        $sacraments   = $this->model->getSacraments((int) $id);
        $transactions = $this->model->getTransactions((int) $id);

        $this->view('Members/views/show', [
            'pageTitle'    => $member['first_name'] . ' ' . $member['last_name'],
            'member'       => $member,
            'sacraments'   => $sacraments,
            'transactions' => $transactions,
        ]);
    }

    public function edit(string $id): void
    {
        $this->requirePermission('members.edit');

        $member = $this->model->find((int) $id);
        if (!$member) { $this->redirect('/members'); }

        $communities = Database::select(
            "SELECT id, name FROM communities WHERE parish_id = ? AND active = 1 ORDER BY name",
            [Auth::parishId()]
        );
        $families = Database::select(
            "SELECT id, family_name FROM families WHERE parish_id = ? ORDER BY family_name",
            [Auth::parishId()]
        );

        $this->view('Members/views/create', [
            'pageTitle'   => 'Hariri: ' . $member['first_name'],
            'communities' => $communities,
            'families'    => $families,
            'member'      => $member,
            'editing'     => true,
        ]);
    }

    public function update(string $id): void
    {
        $this->requirePermission('members.edit');
        $this->verifyCsrf();

        $old  = $this->model->find((int) $id);
        if (!$old) { $this->redirect('/members'); }

        $data = Request::only([
            'first_name', 'middle_name', 'last_name', 'gender', 'date_of_birth',
            'phone', 'email', 'community_id', 'family_id', 'occupation',
            'address', 'marriage_status', 'baptised', 'confirmed', 'status',
        ]);

        $errors = $this->validate($data, [
            'first_name' => 'required|max:80',
            'last_name'  => 'required|max:80',
            'gender'     => 'required',
        ]);

        if ($errors) {
            Session::flash('error', 'Tafadhali sahihisha makosa yaliyoonyeshwa.');
            $this->redirect("/members/{$id}/edit");
            return;
        }

        $data['baptised']     = isset($data['baptised']) ? 1 : 0;
        $data['confirmed']    = isset($data['confirmed']) ? 1 : 0;
        $data['community_id'] = $data['community_id'] ?: null;
        $data['family_id']    = $data['family_id'] ?: null;
        $data['date_of_birth'] = $data['date_of_birth'] ?: null;

        $this->model->update((int) $id, $data);
        Audit::log('member.update', 'Members', 'member', (int) $id, $old, $data);

        Session::flash('success', __('members.member_updated', 'Mwanachama amesasishwa.'));
        $this->redirect("/members/{$id}");
    }

    public function destroy(string $id): void
    {
        $this->requirePermission('members.delete');
        $this->verifyCsrf();

        $member = $this->model->find((int) $id);
        if (!$member) { $this->redirect('/members'); }

        $this->model->softDelete((int) $id);
        Audit::log('member.delete', 'Members', 'member', (int) $id, $member);

        Session::flash('success', __('members.member_deleted', 'Mwanachama amefutwa.'));
        $this->redirect('/members');
    }

    public function memberCard(string $id): void
    {
        $this->requirePermission('members.view');
        $member = $this->model->find((int) $id);
        if (!$member) { $this->redirect('/members'); }

        $this->view('Members/views/card', ['member' => $member], 'auth');
    }
}
